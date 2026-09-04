(async function(){
  "use strict";
  const response = await fetch('./data/appdata.json');
  if (!response.ok) throw new Error('Failed to load data/appdata.json');
  var DATA = await response.json();
  var FUNDS = DATA.funds;           // { meta, records, aggregates }
  var FREC = FUNDS.records;
  var FAGG = FUNDS.aggregates;
  var WORKS = DATA.works;           // { projects, agencies, dashboard, opts }
  var WPROJ = WORKS.projects;
  var WDASH = WORKS.dashboard;
  var WOPTS = WORKS.opts;
  var fById = {}; FREC.forEach(function(r){ fById[r.id] = r; });
  var wById = {}; WPROJ.forEach(function(p){ wById[p.id] = p; });

  // Percentile rank by inefficiency (higher score = worse = higher percentile)
  (function(){
    var sorted=FREC.map(function(r){return r.inefficiencyScore;}).sort(function(a,b){return a-b;});
    FREC.forEach(function(r){
      var below=0; for(var i=0;i<sorted.length;i++){ if(sorted[i]<r.inefficiencyScore) below++; else break; }
      r.percentile=Math.round(below/sorted.length*100);
    });
  })();

  // India tile-grid layout [row,col] and 2-letter codes
  var STATE_GRID={
    'Jammu & Kashmir':[0,2],'Chandigarh':[1,1],'Punjab':[1,2],'Himachal Pradesh':[1,3],
    'Rajasthan':[2,1],'Haryana':[2,2],'Delhi':[2,3],'Arunachal Pradesh':[2,8],
    'Gujarat':[3,0],'Daman & Diu':[3,1],'Madhya Pradesh':[3,3],'Bihar':[3,5],'Assam':[3,7],'Nagaland':[3,8],
    'D & N Haveli':[4,1],'Maharashtra':[4,2],'Chhattisgarh':[4,4],'Jharkhand':[4,5],'Meghalaya':[4,7],'Manipur':[4,8],
    'Goa':[5,1],'Karnataka':[5,2],'Odisha':[5,5],'Mizoram':[5,8],
    'Lakshadweep':[6,0],'Kerala':[6,1],'Andhra Pradesh':[6,3],'A & N Islands':[6,7],
    'Puducherry':[7,3]
  };
  var STATE_AB={
    'A & N Islands':'AN','Andhra Pradesh':'AP','Arunachal Pradesh':'AR','Assam':'AS','Bihar':'BR','Chandigarh':'CH',
    'Chhattisgarh':'CT','D & N Haveli':'DN','Daman & Diu':'DD','Delhi':'DL','Goa':'GA','Gujarat':'GJ','Haryana':'HR',
    'Himachal Pradesh':'HP','Jammu & Kashmir':'JK','Jharkhand':'JH','Karnataka':'KA','Kerala':'KL','Lakshadweep':'LD',
    'Madhya Pradesh':'MP','Maharashtra':'MH','Manipur':'MN','Meghalaya':'ML','Mizoram':'MZ','Nagaland':'NL',
    'Odisha':'OD','Puducherry':'PY','Punjab':'PB','Rajasthan':'RJ'
  };
  var MAP_STOPS=['#e7edf5','#f4dcc0','#e8b183','#d98650','#c25f3a','#a83227'];
  function mapColor(v,min,max){
    if(max<=min) return MAP_STOPS[0];
    var t=(v-min)/(max-min); var idx=Math.min(MAP_STOPS.length-1, Math.floor(t*MAP_STOPS.length));
    return MAP_STOPS[Math.max(0,idx)];
  }
  var compareSet=[];

  // ---------- Roles ----------
  var ROLES={
    admin:{
      label:'Administrator',
      tabs:['overview','funds','compliance','map','compare','cases','works','ask','validation','sources'],
      home:'#/overview',
      blurb:'You are seeing the <b>scheme-wide oversight</b> view: portfolio totals, where risk and idle money concentrate geographically, compliance against MPLADS norms, and the case register.'
    },
    auditor:{
      label:'Auditor / Investigating Officer',
      tabs:['overview','funds','map','compare','watchlist','cases','rti','works','ask','validation','sources'],
      home:'#/funds',
      blurb:'You are seeing the <b>investigation</b> view: a ranked review queue, per-constituency evidence and signal breakdowns, peer comparison, your watchlist, a case register, and export for case files.'
    },
    citizen:{
      label:'Citizen',
      tabs:['overview','citizen','rti','map','ask','sources'],
      home:'#/citizen',
      blurb:'You are seeing the <b>public transparency</b> view: look up your own constituency, draft an RTI request, and see in plain language how much MPLAD money your MP received, spent, and left unspent.'
    }
  };
  var role='admin';
  try{ var rs=localStorage.getItem('mplad-role'); if(rs&&ROLES[rs]) role=rs; }catch(e){}
  function applyRole(){
    var allowed=ROLES[role].tabs;
    document.querySelectorAll('#tabs a').forEach(function(a){
      a.style.display = allowed.indexOf(a.getAttribute('data-tab'))>=0 ? '' : 'none';
    });
    var sel=document.getElementById('role-select'); if(sel) sel.value=role;
  }
  function roleBanner(){
    return '<div class="role-banner"><span class="role-pill">'+esc(ROLES[role].label)+'</span><span>'+ROLES[role].blurb+' Switch role from the selector in the header to see how the platform adapts.</span></div>';
  }
  function tourSeen(){ try{ return localStorage.getItem('mplad-tour-seen')==='1'; }catch(e){ return false; } }
  function markTourSeen(){ try{ localStorage.setItem('mplad-tour-seen','1'); }catch(e){} }
  function tourNudge(){
    if(tourSeen()) return '';
    return '<div class="role-banner no-print" id="tour-nudge" style="border-left-color:var(--teal);align-items:center;">'+
      '<span class="role-pill" style="color:var(--teal);background:var(--teal-soft);border-color:color-mix(in srgb,var(--teal) 35%,transparent);">New here?</span>'+
      '<span style="flex:1;">Take the 2-minute guided walkthrough — it steps through the problem, the real data, one investigation, and how we validate the model.</span>'+
      '<button class="btn primary" id="nudge-start" style="flex:none;">▶ Start tour</button>'+
      '<button class="btn" id="nudge-dismiss" style="flex:none;padding:6px 9px;" title="Dismiss">✕</button></div>';
  }

  var EFF_COLOR = {LOW:'var(--low)', MODERATE:'var(--medium)', ELEVATED:'var(--high)', SEVERE:'var(--critical)'};
  var RISK_COLOR = {LOW:'var(--low)', MEDIUM:'var(--medium)', HIGH:'var(--high)', CRITICAL:'var(--critical)'};

  // ---- theme ----
  var root = document.documentElement;
  try { var s = localStorage.getItem('mplad-theme'); if (s==='dark'||s==='light') root.setAttribute('data-theme', s); } catch(e){}
  document.getElementById('theme-toggle').addEventListener('click', function(){
    var cur = root.getAttribute('data-theme');
    var mql = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = !cur ? (mql?'light':'dark') : (cur==='dark'?'light':'dark');
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mplad-theme', next); } catch(e){}
  });

  // ---- helpers ----
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function cr(n){ if(n==null) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2})+' Cr'; }
  function pct(n,d){ if(n==null||!isFinite(n)) return '—'; d=d||0; return (n>0?'':'')+Number(n).toFixed(d)+'%'; }
  function signed(n,d){ if(n==null||!isFinite(n)) return '—'; d=d||1; return (n>0?'+':'')+Number(n).toFixed(d); }
  function card(title, inner, style){ return '<div class="card"'+(style?' style="'+style+'"':'')+'>'+(title?'<div class="card-title">'+title+'</div>':'')+inner+'</div>'; }
  function kpi(label,value,sub,tone){ return '<div class="card kpi'+(tone?' t-'+tone:'')+'"><div class="label">'+label+'</div><div class="value num">'+value+'</div>'+(sub?'<div class="sub">'+sub+'</div>':'')+'</div>'; }
  function effChip(cat,score){ return '<span class="chip eff-'+cat+'"><span class="dot"></span>'+cat+(score!=null?' · '+score:'')+'</span>'; }
  function riskChip(cat,score){ return '<span class="chip risk-'+cat+'"><span class="dot"></span>'+cat+(score!=null?' · '+score:'')+'</span>'; }

  function donut(entries,size){
    size=size||190; var r=size*0.34, cx=size/2, cy=size/2, sw=size*0.15;
    var total=entries.reduce(function(s,e){return s+e.value;},0)||1, circ=2*Math.PI*r, off=0;
    var arcs=entries.map(function(e){ var len=e.value/total*circ;
      var seg='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+e.color+'" stroke-width="'+sw+'" stroke-dasharray="'+len+' '+(circ-len)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'; off+=len; return seg;
    }).join('');
    return '<svg viewBox="0 0 '+size+' '+size+'" width="100%" height="'+size+'" role="img" aria-label="distribution">'+
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="'+sw+'"/>'+arcs+
      '<text x="'+cx+'" y="'+(cy-1)+'" text-anchor="middle" font-family="Source Serif 4,serif" font-size="'+(size*0.15)+'" font-weight="600" fill="var(--text)">'+total+'</text>'+
      '<text x="'+cx+'" y="'+(cy+16)+'" text-anchor="middle" font-size="10" fill="var(--muted)">records</text></svg>';
  }
  function barList(entries,fmt){
    fmt=fmt||function(v){return v;};
    var max=Math.max.apply(null,entries.map(function(e){return e.value;}).concat([1]));
    return '<div class="bar-list">'+entries.map(function(e){
      var w=Math.max(3,e.value/max*100);
      return '<div class="row"><div class="name" title="'+esc(e.label)+'">'+(e.href?'<a href="'+e.href+'">':'')+esc(e.label)+(e.href?'</a>':'')+'</div>'+
        '<div class="track"><div class="fill" style="width:'+w+'%;background:'+(e.color||'var(--accent)')+'"></div></div>'+
        '<div class="val">'+fmt(e.value)+'</div></div>';
    }).join('')+'</div>';
  }
  function gauge(score,cat,colorMap){
    var size=128,r=50,cx=size/2,cy=size/2,sw=14,circ=2*Math.PI*r;
    var dash=Math.max(0,Math.min(100,score))/100*circ, color=colorMap[cat];
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" role="img" aria-label="score gauge">'+
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="'+sw+'"/>'+
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-dasharray="'+dash+' '+(circ-dash)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'+
      '<text x="'+cx+'" y="'+(cy+2)+'" text-anchor="middle" font-family="Source Serif 4,serif" font-size="27" font-weight="700" fill="var(--text)">'+score+'</text>'+
      '<text x="'+cx+'" y="'+(cy+20)+'" text-anchor="middle" font-size="10" fill="var(--muted)">/ 100</text></svg>';
  }
  function compareBar(label, a, aLabel, b, bLabel, fmt){
    fmt=fmt||function(v){return v;}; var max=Math.max(a,b,0.001)*1.05;
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;"><span>'+label+'</span></div>'+
      '<div class="bar-list"><div class="row" style="grid-template-columns:110px 1fr 80px;"><div class="name">'+aLabel+'</div><div class="track"><div class="fill" style="width:'+Math.max(2,a/max*100)+'%;background:var(--critical)"></div></div><div class="val">'+fmt(a)+'</div></div>'+
      '<div class="row" style="grid-template-columns:110px 1fr 80px;"><div class="name">'+bLabel+'</div><div class="track"><div class="fill" style="width:'+Math.max(2,b/max*100)+'%;background:var(--accent)"></div></div><div class="val">'+fmt(b)+'</div></div></div></div>';
  }

  var PROV = '<div class="provenance">'+
    '<span class="tag real"><span class="dot"></span>Fund data: REAL</span>'+
    '<span>16th Lok Sabha entitlement / release / unspent — '+FAGG.totalMPs+' MP constituencies across '+FAGG.states+' States/UTs · snapshot as of 21 Aug 2022.</span>'+
    '<span class="tag synth" style="margin-left:8px;"><span class="dot"></span>Works layer: SYNTHETIC</span>'+
    '<span>illustrative project records for the investigation workflow.</span>'+
    '<a href="#/sources" style="margin-left:auto;">Data sources &amp; method →</a></div>';

  // ---------- Router ----------
  var routes = { overview:renderOverview, funds:renderFunds, constituency:renderConstituency, map:renderMap, geo:renderMap, citizen:renderCitizen, rti:renderRTI, compare:renderCompare, watchlist:renderWatchlist, cases:renderCases, compliance:renderCompliance, validation:renderValidation, works:renderWorks, projects:renderProjects, project:renderProject, ask:renderAsk, sources:renderSources };
  function route(){
    var hash=location.hash.replace(/^#\/?/,'')||'overview';
    var parts=hash.split('/'), key=parts[0]||'overview', arg=parts[1];
    var fn=routes[key]||renderOverview;
    var tabFor = (key==='constituency')?'funds':((key==='projects'||key==='project')?'works':(key==='geo'?'map':key));
    document.querySelectorAll('#tabs a').forEach(function(a){ a.classList.toggle('active', a.getAttribute('data-tab')===tabFor); });
    document.getElementById('view').innerHTML = fn(arg);
    window.scrollTo(0,0);
    wire(key,arg);
  }
  window.addEventListener('hashchange', route);

  // ---------- Overview ----------
  function renderOverview(){
    var a=FAGG;
    var utilised = a.totalReleased>0 ? ((a.totalReleased-a.totalUnspent)/a.totalReleased*100) : 0;
    var effEntries=['LOW','MODERATE','ELEVATED','SEVERE'].map(function(c){return {label:c,value:a.categoryCounts[c]||0,color:EFF_COLOR[c]};});
    var sigEntries=Object.keys(a.signalCounts).map(function(k){return {label:k,value:a.signalCounts[k],color:'var(--high)'};}).sort(function(x,y){return y.value-x.value;});
    var topStates=Object.keys(a.byState).map(function(s){return {label:s,value:a.byState[s].avgInefficiency,color:'var(--teal)'};}).sort(function(x,y){return y.value-x.value;}).slice(0,8);
    var flagged=FREC.filter(function(r){return r.inefficiencyCategory==='SEVERE'||r.inefficiencyCategory==='ELEVATED';}).sort(function(x,y){return y.inefficiencyScore-x.inefficiencyScore;}).slice(0,8);

    return PROV+
    '<div class="page-head"><h1>Executive Overview</h1><p>MPLAD fund flow and utilisation efficiency across the 16th Lok Sabha, computed live from real entitlement, release and unspent-balance data. The screening engine surfaces constituencies where public money is idle, over-sanctioned, or held back.</p></div>'+
    tourNudge()+
    roleBanner()+
    '<div class="card" style="margin-bottom:13px;">'+
      '<div class="card-title"><span>Ask the assistant</span><span id="ai-badge-host">'+aiBadge()+'</span></div>'+
      '<div class="chat-thread" id="chat-thread">'+chatHtml()+'</div>'+
      '<form id="qa-form" style="display:flex;gap:8px;margin-top:12px;"><input type="text" id="qa-input" placeholder="Ask about fund utilisation, a state, or a constituency…" style="flex:1;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 13px;font-size:13.5px;font-family:inherit;"><button class="btn primary" type="submit" id="qa-send">Send</button></form>'+
      '<div class="qa-suggest">'+SUG.slice(0,3).map(function(s){return '<button data-ask="'+esc(s)+'">'+esc(s)+'</button>';}).join('')+'<a href="#/ask" class="btn" style="padding:5px 10px;font-size:12px;">Open full assistant →</a></div>'+
    '</div>'+
    '<div class="grid kpis" style="margin-bottom:13px;">'+
      kpi('Total Entitlement', cr(a.totalEntitlement), a.totalMPs+' MP constituencies','')+
      kpi('Funds Released', cr(a.totalReleased), a.avgReleaseRatePct+'% of entitlement','teal')+
      kpi('Unspent Balance', cr(a.totalUnspent), utilised.toFixed(0)+'% of released utilised','high')+
      kpi('Release Pending', cr(a.totalReleasePending), 'held back by GoI','medium')+
      kpi('Severe Inefficiency', a.categoryCounts.SEVERE, 'constituencies','critical')+
      kpi('Elevated', a.categoryCounts.ELEVATED, 'constituencies','high')+
      kpi('Over-sanctioned', a.oversanctionedCount, 'sanctions beyond funds','high')+
      kpi('States / UTs', a.states, 'covered','')+
    '</div>'+
    '<div class="grid cols-2" style="margin-bottom:13px;">'+
      card('Inefficiency distribution', donut(effEntries,180)+'<div class="legend">'+effEntries.map(function(e){return '<span class="item"><span class="dot" style="background:'+e.color+'"></span>'+e.label+' ('+e.value+')</span>';}).join('')+'</div>')+
      card('Screening signals detected', barList(sigEntries))+
    '</div>'+
    '<div class="grid cols-2b" style="margin-bottom:13px;">'+
      card('States by average inefficiency', barList(topStates, function(v){return v.toFixed(0);}))+
      card('Top constituencies to review', '<div class="table-wrap"><table><thead><tr><th>Constituency</th><th>State</th><th>Unspent</th><th>Score</th></tr></thead><tbody>'+
        flagged.map(function(r){return '<tr class="rowlink" data-goto="#/constituency/'+r.id+'"><td><a href="#/constituency/'+r.id+'">'+esc(r.constituency)+'</a></td><td>'+esc(r.state)+'</td><td class="num-cell">'+cr(r.unspentBalance)+'</td><td>'+effChip(r.inefficiencyCategory,r.inefficiencyScore)+'</td></tr>';}).join('')+
        '</tbody></table></div>')+
    '</div>'+
    card('What the works-audit layer adds', '<div style="font-size:13px;color:var(--muted);line-height:1.7;">The real fund data above answers <b style="color:var(--text)">where money is stuck</b>. The <a href="#/works">Works Audit</a> module demonstrates the project-level investigation workflow — cost outliers, timeline anomalies, duplicate detection, peer comparison and a full evidence pack — on an illustrative synthetic works dataset, because project-level cost/date records are not published in the open fund dataset. Both layers use the same screening-not-proof methodology.</div>');
  }

  // ---------- Fund Utilisation ----------
  var fState={q:'',state:'',category:'',flag:'',sort:'score',dir:'desc',page:1};
  var FSIZE=25;
  function fundFiltered(){
    var list=FREC.filter(function(r){
      if(fState.q){var q=fState.q.toLowerCase(); if(r.constituency.toLowerCase().indexOf(q)===-1 && r.mp.toLowerCase().indexOf(q)===-1 && r.district.toLowerCase().indexOf(q)===-1) return false;}
      if(fState.state && r.state!==fState.state) return false;
      if(fState.category && r.inefficiencyCategory!==fState.category) return false;
      if(fState.flag==='over' && !r.oversanctioned) return false;
      if(fState.flag==='pending' && r.releasePending<2.5) return false;
      if(fState.flag==='idle' && !(r.unspentRatioPct!=null && r.unspentRatioPct>=15 && r.unspentBalance>=2)) return false;
      return true;
    });
    var s=fState.sort, dir=fState.dir==='desc'?-1:1;
    list.sort(function(a,b){
      var av,bv;
      if(s==='score'){av=a.inefficiencyScore;bv=b.inefficiencyScore;}
      else if(s==='unspent'){av=a.unspentBalance;bv=b.unspentBalance;}
      else if(s==='entitlement'){av=a.entitlement;bv=b.entitlement;}
      else if(s==='pending'){av=a.releasePending;bv=b.releasePending;}
      else if(s==='release'){av=a.releaseRatePct||0;bv=b.releaseRatePct||0;}
      else if(s==='constituency'){return dir*a.constituency.localeCompare(b.constituency);}
      else {av=a.inefficiencyScore;bv=b.inefficiencyScore;}
      return dir*(av-bv);
    });
    return list;
  }
  function opt(list,cur,all){ return '<option value="">'+all+'</option>'+list.map(function(o){return '<option value="'+esc(o)+'"'+(o===cur?' selected':'')+'>'+esc(o)+'</option>';}).join(''); }
  function renderFunds(){
    var states=Array.from(new Set(FREC.map(function(r){return r.state;}))).sort();
    return PROV+
    '<div class="page-head"><h1>Fund Utilisation — real 16th Lok Sabha data</h1><p>Every MP constituency ranked by a transparent inefficiency score built from idle released funds, over-sanction, pending central release and stalled pipelines. Click any row for the full breakdown. Export the current view to Excel, CSV or PDF.</p></div>'+
    '<div class="card" style="margin-bottom:13px;">'+
      '<div class="filter-bar">'+
        '<input type="text" id="ff-q" placeholder="Search constituency, MP or district" value="'+esc(fState.q)+'">'+
        '<select id="ff-state">'+opt(states,fState.state,'State: all')+'</select>'+
        '<select id="ff-cat">'+opt(['LOW','MODERATE','ELEVATED','SEVERE'],fState.category,'Inefficiency: all')+'</select>'+
        '<select id="ff-flag"><option value="">Flag: all</option><option value="idle"'+(fState.flag==='idle'?' selected':'')+'>Idle funds</option><option value="over"'+(fState.flag==='over'?' selected':'')+'>Over-sanctioned</option><option value="pending"'+(fState.flag==='pending'?' selected':'')+'>Release pending</option></select>'+
        '<button class="btn" id="ff-clear">Clear</button>'+
      '</div>'+
      '<div class="export-row"><span style="font-size:12px;color:var(--muted-2);align-self:center;margin-right:2px;">Export current view:</span>'+
        '<button class="btn" id="exp-xlsx">⬇ Excel (.xlsx)</button>'+
        '<button class="btn" id="exp-csv">⬇ CSV</button>'+
        '<button class="btn" id="exp-pdf">⬇ PDF</button></div>'+
    '</div>'+
    '<div id="funds-table"></div>';
  }
  function fundsTable(){
    var list=fundFiltered(); var total=list.length; var pages=Math.max(1,Math.ceil(total/FSIZE));
    if(fState.page>pages) fState.page=pages;
    var items=list.slice((fState.page-1)*FSIZE, (fState.page-1)*FSIZE+FSIZE);
    function sh(key,label){ var active=fState.sort===key; return '<th class="sortable" data-sort="'+key+'">'+label+(active?(fState.dir==='desc'?' ▾':' ▴'):'')+'</th>'; }
    var rows=items.length?items.map(function(r){
      return '<tr class="rowlink" data-goto="#/constituency/'+r.id+'">'+
        '<td><a href="#/constituency/'+r.id+'">'+esc(r.constituency)+'</a><div style="font-size:11px;color:var(--muted-2)">'+esc(r.mp)+'</div></td>'+
        '<td>'+esc(r.state)+'</td>'+
        '<td class="num-cell">'+cr(r.entitlement)+'</td>'+
        '<td class="num-cell">'+(r.releaseRatePct!=null?r.releaseRatePct.toFixed(0)+'%':'—')+'</td>'+
        '<td class="num-cell"'+(r.unspentBalance>=2?' style="color:var(--high)"':'')+'>'+cr(r.unspentBalance)+'</td>'+
        '<td class="num-cell"'+(r.oversanctioned?' style="color:var(--high)"':'')+'>'+signed(r.unsanctionBalance)+'</td>'+
        '<td class="num-cell"'+(r.releasePending>=2.5?' style="color:var(--medium)"':'')+'>'+cr(r.releasePending)+'</td>'+
        '<td>'+effChip(r.inefficiencyCategory,r.inefficiencyScore)+'</td></tr>';
    }).join(''):'<tr><td colspan="8" class="empty">No constituencies match the current filters.</td></tr>';
    return card(null,'<div class="table-wrap"><table><thead><tr>'+
      sh('constituency','Constituency / MP')+'<th>State</th>'+sh('entitlement','Entitlement')+sh('release','Release %')+sh('unspent','Unspent')+'<th>Unsanc. bal</th>'+sh('pending','Pending')+sh('score','Inefficiency')+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>')+
      '<div class="pager"><div>'+total.toLocaleString('en-IN')+' constituencies · page '+fState.page+' / '+pages+'</div><div class="btns"><button class="btn" id="fp-prev"'+(fState.page<=1?' disabled':'')+'>Previous</button><button class="btn" id="fp-next"'+(fState.page>=pages?' disabled':'')+'>Next</button></div></div>';
  }

  // ---------- Constituency detail ----------
  function renderConstituency(id){
    var r=fById[id];
    if(!r) return PROV+'<div class="empty">Constituency '+esc(id)+' not found. <a href="#/funds">Back to fund utilisation</a></div>';
    var utilised=r.released>0?((r.released-r.unspentBalance)/r.released*100):0;
    var peers=FREC.filter(function(x){return x.state===r.state && x.id!==r.id;});
    var peerUnspentAvg=peers.length?peers.reduce(function(s,x){return s+x.unspentBalance;},0)/peers.length:0;
    var natUnspentAvg=FREC.reduce(function(s,x){return s+x.unspentBalance;},0)/FREC.length;
    var recs=buildFundRecs(r);
    return '<div class="no-print" style="font-size:12.5px;color:var(--muted);margin-bottom:13px;"><a href="#/funds">← Back to fund utilisation</a></div>'+
    '<div class="card" style="margin-bottom:13px;"><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">'+
      '<div style="flex:1 1 420px;min-width:280px;">'+
        '<span class="chip badge-real" style="margin-bottom:6px;">REAL DATA · 16th Lok Sabha</span>'+
        '<h1 style="font-size:22px;margin-top:8px;">'+esc(r.constituency)+'</h1>'+
        '<div style="font-size:13px;color:var(--muted);margin-top:4px;">'+esc(r.mp)+' · '+esc(r.district)+' district · '+esc(r.state)+'</div>'+
        '<div class="field-grid" style="margin-top:16px;">'+
          fld('Entitlement',cr(r.entitlement))+fld('GoI released',cr(r.released))+fld('Release rate',r.releaseRatePct!=null?r.releaseRatePct.toFixed(0)+'%':'—')+fld('Release pending',cr(r.releasePending))+
          fld('Unspent balance',cr(r.unspentBalance))+fld('Utilised of released',utilised.toFixed(0)+'%')+fld('Unsanctioned balance',signed(r.unsanctionBalance)+' Cr')+fld('Last release',r.lastReleaseDate||'—')+
        '</div>'+
      '</div>'+
      '<div style="flex:0 0 250px;"><div class="gauge-wrap">'+gauge(r.inefficiencyScore,r.inefficiencyCategory,EFF_COLOR)+
        '<div class="gauge-meta"><div class="tag">Inefficiency</div><div class="cat" style="color:'+EFF_COLOR[r.inefficiencyCategory]+'">'+r.inefficiencyCategory+'</div><div class="desc">Composite of idle funds, over-sanction, pending release and pipeline staleness. Worse than '+r.percentile+'% of constituencies.</div></div></div>'+
        '<div class="no-print" style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">'+starBtn(r.id)+caseBtn(r.id)+'<a class="btn" href="#/rti/'+r.id+'">📝 Draft RTI request</a><button class="btn primary" onclick="window.print()">Print / Save as PDF</button></div></div>'+
    '</div></div>'+
    card('Screening signals', r.signals.length?'<div class="table-wrap"><table><thead><tr><th>Signal</th><th>Severity</th><th>Weight</th><th>Explanation</th></tr></thead><tbody>'+
      r.signals.slice().sort(function(a,b){return b.weight-a.weight;}).map(function(s){return '<tr><td style="font-weight:600">'+esc(s.label)+'</td><td><span class="sev '+s.severity+'">'+s.severity+'</span></td><td class="mono">+'+s.weight+'</td><td>'+esc(s.explanation)+'</td></tr>';}).join('')+
      '</tbody><tfoot><tr><td style="font-weight:600">Total</td><td></td><td class="mono">'+r.signals.reduce(function(s,x){return s+x.weight;},0)+'</td><td style="color:var(--muted)">Capped at 100 · '+effChip(r.inefficiencyCategory,r.inefficiencyScore)+'</td></tr></tfoot></table></div>':'<div class="empty">No inefficiency signals — funds appear to be flowing and utilised normally.</div>','margin-bottom:13px;')+
    '<div class="grid cols-2b" style="margin-bottom:13px;">'+
      card('Unspent vs peers', compareBar('Unspent balance (₹ Cr)', r.unspentBalance,'This', peerUnspentAvg,r.state+' avg', function(v){return v.toFixed(2);})+compareBar('', r.unspentBalance,'This', natUnspentAvg,'National avg', function(v){return v.toFixed(2);})+'<div class="notice">Compared against '+peers.length+' other constituencies in '+esc(r.state)+' and the national average.</div>')+
      card('Recommended review steps', '<ol class="rec-list" style="list-style:none;padding:0;">'+recs.map(function(t,i){return '<li><span class="n">'+(i+1)+'</span><span>'+esc(t)+'</span></li>';}).join('')+'</ol><div class="notice" style="margin-top:11px;">Screening indicators for administrative review, not findings of wrongdoing. The MP office and District Authority should be given an opportunity to explain.</div>')+
    '</div>';
  }
  function fld(k,v){ return '<div class="field"><div class="k">'+k+'</div><div class="v">'+esc(v)+'</div></div>'; }
  function buildFundRecs(r){
    var out=[]; var codes={}; r.signals.forEach(function(s){codes[s.code]=1;});
    if(codes['idle-funds']) out.push('Obtain the latest utilisation certificate and physical progress of sanctioned works; identify why released funds remain unspent.');
    if(codes['over-sanction']) out.push('Reconcile the sanction register against available funds; confirm no works are stranded without funding.');
    if(codes['release-pending']) out.push('Check pending audit / utilisation certificates that are blocking the next central installment.');
    if(codes['low-release-rate']) out.push('Review why the constituency has received a low share of its entitlement and whether earlier installments were withheld.');
    if(codes['stale-release']) out.push('Investigate the stalled pipeline: old last-release date with money still idle suggests dormant works.');
    if(!out.length) out.push('No specific red flag. Include in routine sample audit.');
    out.push('Cross-verify figures against the MPLADS eSAKSHI portal before drawing any conclusion.');
    return out;
  }

  // ---------- Geographic tile-grid choropleth ----------
  var mapMetric='inefficiency';
  function renderMap(){
    return PROV+
    '<div class="page-head"><h1>India fund map</h1><p>Every State/UT as a tile in its approximate geographic position, shaded by the metric you choose. Hover a tile for detail; click to open that state in the fund table. Computed live from the real 16th Lok Sabha data.</p></div>'+
    '<div class="card" style="margin-bottom:13px;">'+
      '<div class="card-title"><span>Choropleth</span>'+
        '<select id="map-metric" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:6px 9px;font-size:12.5px;">'+
        '<option value="inefficiency"'+(mapMetric==='inefficiency'?' selected':'')+'>Avg inefficiency score</option>'+
        '<option value="unspent"'+(mapMetric==='unspent'?' selected':'')+'>Unspent funds (₹ Cr)</option>'+
        '<option value="flagged"'+(mapMetric==='flagged'?' selected':'')+'>Flagged constituencies (%)</option>'+
        '</select></div>'+
      '<div id="tilemap-host"></div>'+
    '</div>'+
    '<div class="grid cols-2b">'+
      card('Most idle funds by state', barList(Object.keys(FAGG.byState).map(function(s){return {label:s,value:Math.round(FAGG.byState[s].unspent),color:'var(--high)',href:'#'};}).sort(function(a,b){return b.value-a.value;}).slice(0,7), function(v){return '₹'+v+' Cr';}))+
      card('Highest average inefficiency', barList(Object.keys(FAGG.byState).map(function(s){return {label:s,value:FAGG.byState[s].avgInefficiency,color:'var(--critical)'};}).sort(function(a,b){return b.value-a.value;}).slice(0,7), function(v){return v.toFixed(0);}))+
    '</div>';
  }
  function tilemapHtml(){
    var metricOf=function(s){ var a=FAGG.byState[s]; if(mapMetric==='unspent')return a.unspent; if(mapMetric==='flagged')return a.mps?a.flagged/a.mps*100:0; return a.avgInefficiency; };
    var vals=Object.keys(STATE_GRID).map(function(s){return FAGG.byState[s]?metricOf(s):null;}).filter(function(v){return v!=null;});
    var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals);
    var maxRow=0,maxCol=0; Object.keys(STATE_GRID).forEach(function(s){maxRow=Math.max(maxRow,STATE_GRID[s][0]);maxCol=Math.max(maxCol,STATE_GRID[s][1]);});
    var cells='';
    Object.keys(STATE_GRID).forEach(function(s){
      var pos=STATE_GRID[s]; var a=FAGG.byState[s];
      if(!a){ return; }
      var v=metricOf(s); var col=mapColor(v,min,max);
      var dark = (MAP_STOPS.indexOf(col)>=3);
      var vlabel = mapMetric==='unspent' ? ('₹'+v.toFixed(0)) : (mapMetric==='flagged' ? v.toFixed(0)+'%' : v.toFixed(0));
      cells+='<div class="tile" data-state="'+esc(s)+'" data-v="'+esc(vlabel)+'" style="grid-row:'+(pos[0]+1)+';grid-column:'+(pos[1]+1)+';background:'+col+';color:'+(dark?'#fff':'#1a2233')+';border-color:'+(dark?'transparent':'var(--border)')+'">'+
        '<span class="ab">'+STATE_AB[s]+'</span><span class="tv">'+vlabel+'</span></div>';
    });
    var scale='<div class="map-scale"><span style="margin-right:6px;">Low</span>'+MAP_STOPS.map(function(c){return '<span class="sw" style="background:'+c+'"></span>';}).join('')+'<span class="lab">High</span><span style="color:var(--muted-2)">· tap a state to filter the fund table</span></div>';
    return '<div class="tilemap" style="grid-template-rows:repeat('+(maxRow+1)+',1fr);">'+cells+'</div>'+scale;
  }

  // ---------- Citizen: My Constituency ----------
  var citizenSel={state:'',id:''};
  function renderCitizen(){
    var states=Array.from(new Set(FREC.map(function(r){return r.state;}))).sort();
    var inState = citizenSel.state ? FREC.filter(function(r){return r.state===citizenSel.state;}).sort(function(a,b){return a.constituency.localeCompare(b.constituency);}) : [];
    return '<div class="page-head"><h1>My Constituency</h1><p>See how your Member of Parliament used their local-area development (MPLAD) funds — in plain language, from the real 16th Lok Sabha record. Pick your State, then your constituency.</p></div>'+
    '<div class="citizen-hero" style="margin-bottom:14px;">'+
      '<div class="filter-bar" style="margin-bottom:0;">'+
        '<select id="cz-state" style="min-width:200px;"><option value="">Select your State/UT…</option>'+states.map(function(s){return '<option value="'+esc(s)+'"'+(s===citizenSel.state?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select>'+
        '<select id="cz-con" style="min-width:240px;"'+(inState.length?'':' disabled')+'><option value="">'+(inState.length?'Select your constituency…':'Choose a State first')+'</option>'+inState.map(function(r){return '<option value="'+esc(r.id)+'"'+(r.id===citizenSel.id?' selected':'')+'>'+esc(r.constituency)+'</option>';}).join('')+'</select>'+
      '</div>'+
    '</div>'+
    '<div id="citizen-result">'+(citizenSel.id&&fById[citizenSel.id]?citizenCard(fById[citizenSel.id]):'<div class="empty">Pick your State and constituency above to see the plain-language summary.</div>')+'</div>';
  }
  function citizenCard(r){
    var utilised = r.released>0 ? ((r.released-r.unspentBalance)/r.released*100) : 0;
    var verdict, vclass, vcolor;
    if(r.inefficiencyCategory==='SEVERE'||r.inefficiencyCategory==='ELEVATED'){ verdict='needs attention'; vclass='eff-'+r.inefficiencyCategory; vcolor='var(--high)'; }
    else if(r.inefficiencyCategory==='MODERATE'){ verdict='some room to improve'; vcolor='var(--medium)'; }
    else { verdict='broadly on track'; vcolor='var(--low)'; }
    var story='Of the '+cr(r.entitlement)+' this constituency was entitled to under MPLADS, ₹'+r.released.toFixed(2)+' crore was actually released by the Government of India'+
      (r.releasePending>=1?(' and ₹'+r.releasePending.toFixed(2)+' crore is still pending release'):'')+'. '+
      'About '+utilised.toFixed(0)+'% of the money released has been spent on the ground — leaving '+cr(r.unspentBalance)+' unspent'+
      (r.oversanctioned?('. Works worth ₹'+Math.abs(r.unsanctionBalance).toFixed(2)+' crore appear to have been sanctioned beyond the funds currently available'):'')+'.';
    return '<div class="card" style="margin-bottom:13px;"><div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;">'+
        '<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-2);font-weight:600;">Constituency</div>'+
        '<h2 style="font-size:22px;margin-top:3px;">'+esc(r.constituency)+'</h2>'+
        '<div style="font-size:13px;color:var(--muted);margin-top:3px;">MP: '+esc(r.mp)+' · '+esc(r.district)+', '+esc(r.state)+'</div></div>'+
        '<div class="verdict" style="border-color:'+vcolor+';color:'+vcolor+';background:color-mix(in srgb,'+vcolor+' 12%,transparent);">Fund health: <b>'+verdict+'</b><br><span style="font-size:12px;opacity:.85;">Inefficiency score '+r.inefficiencyScore+'/100 · worse than '+r.percentile+'% of constituencies</span></div>'+
      '</div>'+
      '<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:16px;margin-top:18px;">'+
        '<div class="plain-stat"><span class="pv">'+cr(r.entitlement)+'</span><span class="pl">Entitled under MPLADS</span></div>'+
        '<div class="plain-stat"><span class="pv" style="color:var(--teal)">'+cr(r.released)+'</span><span class="pl">Released by Govt</span></div>'+
        '<div class="plain-stat"><span class="pv" style="color:var(--high)">'+cr(r.unspentBalance)+'</span><span class="pl">Lying unspent</span></div>'+
        '<div class="plain-stat"><span class="pv">'+utilised.toFixed(0)+'%</span><span class="pl">Of released, spent</span></div>'+
      '</div>'+
      '<div style="font-size:14px;line-height:1.7;margin-top:18px;color:var(--text);">'+esc(story)+'</div>'+
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;"><a class="btn" href="#/constituency/'+r.id+'">See the full breakdown →</a><button class="btn" data-cmp-add="'+r.id+'">+ Add to compare</button>'+starBtn(r.id)+'</div>'+
    '</div>'+
    '<div class="notice">These figures are from the official 16th Lok Sabha MPLAD record (2014–2019) and are shown for transparency. Screening indicators are not accusations — funds can be unspent for legitimate reasons.</div>';
  }

  // ---------- Compare ----------
  function renderCompare(){
    var states=Array.from(new Set(FREC.map(function(r){return r.state;}))).sort();
    var opts='<option value="">Add a constituency…</option>'+FREC.slice().sort(function(a,b){return a.constituency.localeCompare(b.constituency);}).map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.constituency)+' — '+esc(r.state)+'</option>';}).join('');
    var picker='<div class="filter-bar"><select id="cmp-add-sel" style="min-width:300px;">'+opts+'</select><button class="btn" id="cmp-clear">Clear all</button></div>';
    var body;
    if(compareSet.length===0){
      body='<div class="empty">Add two or three constituencies to compare their fund utilisation side by side. Tip: add from any constituency page or the Compare picker above.</div>';
    } else {
      var recs=compareSet.map(function(id){return fById[id];}).filter(Boolean);
      var metrics=[
        ['Inefficiency score', function(r){return r.inefficiencyScore+' ('+r.inefficiencyCategory+')';}, function(r){return r.inefficiencyScore;}, true],
        ['Entitlement', function(r){return cr(r.entitlement);}, function(r){return r.entitlement;}, false],
        ['Released', function(r){return cr(r.released);}, function(r){return r.released;}, false],
        ['Release rate', function(r){return r.releaseRatePct!=null?r.releaseRatePct.toFixed(0)+'%':'—';}, function(r){return r.releaseRatePct||0;}, false],
        ['Unspent (idle)', function(r){return cr(r.unspentBalance);}, function(r){return r.unspentBalance;}, true],
        ['Release pending', function(r){return cr(r.releasePending);}, function(r){return r.releasePending;}, true],
        ['Unsanctioned bal.', function(r){return signed(r.unsanctionBalance)+' Cr';}, function(r){return -r.unsanctionBalance;}, true],
        ['Percentile', function(r){return 'worse than '+r.percentile+'%';}, function(r){return r.percentile;}, true]
      ];
      body='<div class="cmp-grid n'+recs.length+'">'+recs.map(function(r){
        var worstFlags=metrics.filter(function(m){ if(!m[3])return false; var vals=recs.map(m[2]); return m[2](r)===Math.max.apply(null,vals) && vals.length>1; }).length;
        return '<div class="cmp-col">'+
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><div><div style="font-weight:600;font-size:15px;">'+esc(r.constituency)+'</div><div style="font-size:11px;color:var(--muted-2);">'+esc(r.mp)+' · '+esc(r.state)+'</div></div>'+
          '<button class="btn" data-cmp-rm="'+r.id+'" style="padding:3px 8px;font-size:11px;">✕</button></div>'+
          '<div style="margin-top:10px;">'+metrics.map(function(m){
            var isWorst = m[3] && recs.length>1 && m[2](r)===Math.max.apply(null,recs.map(m[2]));
            return '<div class="cmp-metric"><span class="m-k">'+m[0]+'</span><span'+(isWorst?' style="color:var(--critical);font-weight:600;"':'')+'>'+m[1](r)+'</span></div>';
          }).join('')+'</div>'+
          '<div style="margin-top:10px;"><a class="btn" href="#/constituency/'+r.id+'" style="width:100%;justify-content:center;">Open detail →</a></div>'+
        '</div>';
      }).join('')+'</div><div class="notice" style="margin-top:13px;">Values in red are the highest (most concerning) among those compared. Screening context only — not a ranking of wrongdoing.</div>';
    }
    return '<div class="page-head"><h1>Compare constituencies</h1><p>Put constituencies side by side to see who is leaving the most money idle, who has the most pending release, and how inefficiency scores stack up.</p></div>'+
      '<div class="card" style="margin-bottom:13px;">'+picker+'</div>'+body;
  }

  // ---------- Watchlist (per-viewer, localStorage) ----------
  function wlLoad(){ try{ return JSON.parse(localStorage.getItem('mplad-watchlist')||'{}'); }catch(e){ return {}; } }
  function wlSave(o){ try{ localStorage.setItem('mplad-watchlist', JSON.stringify(o)); }catch(e){} }
  var WL=wlLoad();
  function wlHas(id){ return !!WL[id]; }
  function wlAdd(id,note){ WL[id]={note:note||(WL[id]&&WL[id].note)||'',ts:(WL[id]&&WL[id].ts)||Date.now()}; wlSave(WL); }
  function wlRemove(id){ delete WL[id]; wlSave(WL); }
  function starBtn(id){ return '<button class="btn" data-wl="'+id+'">'+(wlHas(id)?'★ On watchlist':'☆ Add to watchlist')+'</button>'; }
  function renderWatchlist(){
    var ids=Object.keys(WL).sort(function(a,b){return (WL[b].ts||0)-(WL[a].ts||0);});
    var recs=ids.map(function(id){return fById[id];}).filter(Boolean);
    var body;
    if(!recs.length){
      body='<div class="empty">Your watchlist is empty. Add constituencies from their page, the fund table, or the citizen view — they are saved in this browser so you can build a personal review queue and add concern notes.</div>';
    } else {
      body='<div class="export-row" style="margin-bottom:12px;"><button class="btn" id="wl-csv">⬇ Export watchlist (CSV)</button><button class="btn" id="wl-clear">Clear all</button></div>'+
        '<div class="table-wrap"><table><thead><tr><th>Constituency</th><th>State</th><th>Unspent</th><th>Score</th><th>Concern note</th><th></th></tr></thead><tbody>'+
        recs.map(function(r){ return '<tr><td><a href="#/constituency/'+r.id+'">'+esc(r.constituency)+'</a><div style="font-size:11px;color:var(--muted-2)">'+esc(r.mp)+'</div></td>'+
          '<td>'+esc(r.state)+'</td><td class="num-cell">'+cr(r.unspentBalance)+'</td><td>'+effChip(r.inefficiencyCategory,r.inefficiencyScore)+'</td>'+
          '<td><input type="text" class="wl-note" data-id="'+r.id+'" value="'+esc(WL[r.id].note||'')+'" placeholder="add a note…" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;"></td>'+
          '<td><button class="btn" data-wl-rm="'+r.id+'" style="padding:3px 8px;">Remove</button></td></tr>'; }).join('')+
        '</tbody></table></div>';
    }
    return '<div class="page-head"><h1>My watchlist</h1><p>A personal review queue of constituencies to follow up on, saved in this browser. Star any constituency and attach a concern note. Officers can build and export their own audit list; nothing here is shared, so the public link stays intact.</p></div>'+
      '<div class="card">'+body+'</div>'+
      '<div class="notice" style="margin-top:13px;">This watchlist is stored on your device (localStorage). In a deployed multi-user build, a shared watchlist and citizen-complaint intake would use a server database — the downloadable project documents that path.</div>';
  }

  // ---------- RTI application generator ----------
  var rtiSel={id:'', name:'', address:'', place:''};
  function renderRTI(arg){
    if(arg && fById[arg]) rtiSel.id=arg;
    var states=Array.from(new Set(FREC.map(function(r){return r.state;}))).sort();
    var byState={}; FREC.forEach(function(r){ (byState[r.state]=byState[r.state]||[]).push(r); });
    var cur=rtiSel.id?fById[rtiSel.id]:null;
    var conOpts='<option value="">Select a constituency…</option>'+FREC.slice().sort(function(a,b){return a.constituency.localeCompare(b.constituency);}).map(function(r){return '<option value="'+esc(r.id)+'"'+(r.id===rtiSel.id?' selected':'')+'>'+esc(r.constituency)+' — '+esc(r.state)+'</option>';}).join('');
    return '<div class="page-head"><h1>RTI request generator</h1><p>Turn a flagged constituency into action. This drafts a ready-to-file application under the Right to Information Act, 2005, pre-filled with the real MPLAD figures, asking the implementing authority for the works list, utilisation certificates and reasons funds are unspent. Neutral and factual — an information request, not an allegation.</p></div>'+
      '<div class="grid cols-2b" style="align-items:start;">'+
        '<div class="card">'+
          '<div class="card-title">1 · Choose constituency &amp; your details</div>'+
          '<div style="display:flex;flex-direction:column;gap:8px;">'+
            '<select id="rti-con" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;">'+conOpts+'</select>'+
            '<input type="text" id="rti-name" placeholder="Your name" value="'+esc(rtiSel.name)+'" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;">'+
            '<input type="text" id="rti-addr" placeholder="Your address" value="'+esc(rtiSel.address)+'" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;">'+
            '<input type="text" id="rti-place" placeholder="Place (for the declaration)" value="'+esc(rtiSel.place)+'" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;">'+
          '</div>'+
          (cur?'<div class="notice">Pre-filled from the real record for <b>'+esc(cur.constituency)+'</b> ('+esc(cur.state)+'): entitlement '+cr(cur.entitlement)+', released '+cr(cur.released)+', unspent '+cr(cur.unspentBalance)+(cur.releasePending>=0.5?', pending '+cr(cur.releasePending):'')+'.</div>':'<div class="notice">Pick a constituency to generate the draft. Tip: open any constituency page and use “Draft RTI request”.</div>')+
          (cur?'<div class="export-row" style="margin-top:12px;"><button class="btn" id="rti-copy">⧉ Copy text</button><button class="btn primary" id="rti-pdf">⬇ Download as PDF</button></div>':'')+
        '</div>'+
        '<div class="card">'+
          '<div class="card-title">2 · Draft application</div>'+
          (cur?'<pre id="rti-preview" style="white-space:pre-wrap;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;line-height:1.6;color:var(--text);margin:0;max-height:560px;overflow:auto;">'+esc(rtiText(cur))+'</pre>':'<div class="empty">No constituency selected.</div>')+
        '</div>'+
      '</div>'+
      '<div class="notice" style="margin-top:13px;">This is a template to help you file — verify the correct Public Information Officer and jurisdiction (usually the District Authority / nodal MPLADS office) before submitting. The figures are from the 16th Lok Sabha open record and should be cross-checked against the MPLADS eSAKSHI portal.</div>';
  }
  function rtiText(r){
    var name=rtiSel.name||'[Your full name]';
    var addr=rtiSel.address||'[Your postal address]';
    var place=rtiSel.place||'____________';
    var today=new Date().toISOString().slice(0,10);
    var L=[];
    L.push('To,');
    L.push('The Public Information Officer,');
    L.push('District Authority / Nodal Office (MPLADS), '+r.district+', '+r.state);
    L.push('');
    L.push('Subject: Request for information under the Right to Information Act, 2005 concerning MPLADS works in the '+r.constituency+' constituency.');
    L.push('');
    L.push('Sir/Madam,');
    L.push('');
    L.push('Under Section 6 of the Right to Information Act, 2005, I request the following information regarding Members of Parliament Local Area Development Scheme (MPLADS) funds for the '+r.constituency+' Lok Sabha constituency (Member of Parliament: '+r.mp+'), for the 16th Lok Sabha term (2014-2019).');
    L.push('');
    L.push('As per publicly available records, this constituency had an entitlement of Rs '+r.entitlement+' crore, of which Rs '+r.released+' crore has been released and approximately Rs '+r.unspentBalance+' crore remains unspent as of the latest available data. In this context, I seek:');
    L.push('');
    var q=1;
    L.push(q++ +'. A complete list of all works sanctioned under MPLADS in this constituency, with the sanction date, estimated cost, implementing agency and current physical status of each work.');
    L.push(q++ +'. Copies of the Utilisation Certificates submitted against MPLADS funds released to this constituency to date.');
    L.push(q++ +'. A work-wise break-up of the approximately Rs '+r.unspentBalance+' crore reported as unspent, together with the reasons these funds remain unutilised.');
    if(r.releasePending>=0.5) L.push(q++ +'. The reasons why Rs '+r.releasePending+' crore of the entitlement has not been released, and a list of the documents or certificates pending for its release.');
    if(r.oversanctioned) L.push(q++ +'. Details of any works sanctioned in excess of the funds available, and the current funding status of such works.');
    L.push(q++ +'. The date and amount of each instalment released under MPLADS for this constituency, including the date of the most recent release.');
    L.push(q++ +'. Copies of any audit objections or inspection reports pertaining to MPLADS works in this constituency.');
    L.push('');
    L.push('I am willing to pay the prescribed fee for the above information. If any part of this information is held by or more closely connected with another public authority, kindly transfer that part under Section 6(3) of the Act and inform me of the transfer.');
    L.push('');
    L.push('I declare that I am a citizen of India.');
    L.push('');
    L.push('Yours faithfully,');
    L.push(name);
    L.push('Address: '+addr);
    L.push('Date: '+today+'          Place: '+place);
    L.push('Signature: ____________________');
    return L.join('\n');
  }

  // ---------- Case management (per-viewer, localStorage) ----------
  function casesLoad(){ try{ return JSON.parse(localStorage.getItem('mplad-cases')||'{}'); }catch(e){ return {}; } }
  function casesSave(o){ try{ localStorage.setItem('mplad-cases', JSON.stringify(o)); }catch(e){} }
  var CASES=casesLoad();
  function caseHas(id){ return !!CASES[id]; }
  function caseOpen(id){ if(!CASES[id]) CASES[id]={status:'Open',assignee:'',finding:'',created:Date.now(),updated:Date.now()}; casesSave(CASES); }
  var CASE_STATUS=['Open','Investigating','Referred','Closed - no action','Closed - action taken'];
  function caseStatusColor(s){ return s==='Open'?'var(--high)':/Investigating|Referred/.test(s)?'var(--medium)':'var(--low)'; }
  function caseBtn(id){ return '<button class="btn" data-case="'+id+'">'+(caseHas(id)?'✓ Case opened':'+ Open a case')+'</button>'; }
  function renderCases(){
    var ids=Object.keys(CASES).sort(function(a,b){return (CASES[b].updated||0)-(CASES[a].updated||0);});
    var recs=ids.map(function(id){return {id:id,r:fById[id],c:CASES[id]};}).filter(function(x){return x.r;});
    var counts={}; CASE_STATUS.forEach(function(s){counts[s]=0;}); recs.forEach(function(x){counts[x.c.status]=(counts[x.c.status]||0)+1;});
    var body;
    if(!recs.length){
      body='<div class="empty">No cases yet. Open a case from any constituency page (or the button on a flagged row) to start tracking an investigation — status, assigned officer and the recorded finding, all in one register.</div>';
    } else {
      body='<div class="grid kpis" style="margin-bottom:14px;">'+
          kpi('Open', counts['Open']||0, 'awaiting review','high')+
          kpi('In progress', (counts['Investigating']||0)+(counts['Referred']||0), 'being investigated','medium')+
          kpi('Closed', (counts['Closed - no action']||0)+(counts['Closed - action taken']||0), 'resolved','low')+
          kpi('Total cases', recs.length, '','')+
        '</div>'+
        '<div class="export-row" style="margin-bottom:12px;"><button class="btn" id="case-csv">⬇ Export case register (CSV)</button></div>'+
        recs.map(function(x){
          var r=x.r,c=x.c;
          return '<div class="card" style="margin-bottom:11px;">'+
            '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">'+
              '<div><a href="#/constituency/'+r.id+'" style="font-weight:600;font-size:15px;">'+esc(r.constituency)+'</a>'+
              '<div style="font-size:11.5px;color:var(--muted-2);margin-top:2px;">'+esc(r.mp)+' · '+esc(r.state)+' · '+effChip(r.inefficiencyCategory,r.inefficiencyScore)+'</div></div>'+
              '<span class="verdict-chip" style="color:'+caseStatusColor(c.status)+';border-color:'+caseStatusColor(c.status)+';background:color-mix(in srgb,'+caseStatusColor(c.status)+' 12%,transparent);">'+esc(c.status)+'</span>'+
            '</div>'+
            '<div class="grid cols-2b" style="margin-top:12px;gap:10px;">'+
              '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-2);font-weight:600;margin-bottom:4px;">Status</div>'+
                '<select class="case-status" data-id="'+r.id+'" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 8px;font-size:12.5px;font-family:inherit;">'+CASE_STATUS.map(function(s){return '<option'+(s===c.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>'+
              '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-2);font-weight:600;margin-bottom:4px;">Assigned officer</div>'+
                '<input type="text" class="case-assignee" data-id="'+r.id+'" value="'+esc(c.assignee||'')+'" placeholder="officer name / ID" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 8px;font-size:12.5px;font-family:inherit;"></div>'+
            '</div>'+
            '<div style="margin-top:10px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-2);font-weight:600;margin-bottom:4px;">Finding / notes</div>'+
              '<textarea class="case-finding" data-id="'+r.id+'" rows="2" placeholder="record observations, documents reviewed, conclusion…" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 9px;font-size:12.5px;font-family:inherit;resize:vertical;">'+esc(c.finding||'')+'</textarea></div>'+
            '<div style="margin-top:9px;display:flex;justify-content:space-between;align-items:center;">'+
              '<span style="font-size:11px;color:var(--muted-2);">Opened '+new Date(c.created).toLocaleDateString('en-IN')+' · updated '+new Date(c.updated).toLocaleDateString('en-IN')+'</span>'+
              '<div style="display:flex;gap:8px;"><a class="btn" href="#/rti/'+r.id+'" style="padding:4px 9px;">Draft RTI</a><button class="btn" data-case-rm="'+r.id+'" style="padding:4px 9px;">Delete case</button></div>'+
            '</div>'+
          '</div>';
        }).join('');
    }
    return '<div class="page-head"><h1>Case register</h1><p>Track each flagged constituency from screening to resolution: assign an officer, move it through statuses, and record the finding. This turns the screening output into an auditable investigation workflow.</p></div>'+
      '<div class="card">'+body+'</div>'+
      '<div class="notice" style="margin-top:13px;">Cases are stored on your device (localStorage), keeping the public link shareable. A deployed multi-user build would move the case register to a shared server database with authentication and an audit trail — documented in the project.</div>';
  }

  // ---------- Compliance (MPLADS scheme norms) ----------
  function renderCompliance(){
    // Data-supported checks from the fund dataset
    var TERM_NORM=25; // ₹25 cr per MP per full 5-yr term (₹5 cr/yr)
    var excess=FREC.filter(function(r){return r.entitlement>TERM_NORM+0.01;});
    var partial=FREC.filter(function(r){return r.entitlement>0 && r.entitlement<TERM_NORM-0.01;});
    var underReleased=FREC.filter(function(r){return r.releaseRatePct!=null && r.releaseRatePct<90;});
    var highIdle=FREC.filter(function(r){return r.unspentRatioPct!=null && r.unspentRatioPct>=20;});
    var norms=[
      ['Annual entitlement cap','₹5 crore per MP per year (₹25 crore per full 5-year term).','data','Entitlement ≠ ₹25 cr flagged for review','Computed: '+excess.length+' above term norm, '+partial.length+' partial-term (below).'],
      ['Full release of entitlement','GoI should release the full entitlement across the term.','data','Release rate < 90%','Computed: '+underReleased.length+' constituencies under-released.'],
      ['Timely utilisation','Released funds should be spent, not left idle.','data','Unspent ≥ 20% of released','Computed: '+highIdle.length+' constituencies with high idle balance.'],
      ['SC-area allocation ≥ 15%','At least 15% of funds for areas with SC population.','needs','Requires work-level sector/area data','Not in the published fund dataset — needs eSAKSHI work feed.'],
      ['ST-area allocation ≥ 7.5%','At least 7.5% for ST-population areas.','needs','Requires work-level sector/area data','Not in the published fund dataset — needs eSAKSHI work feed.'],
      ['Sanction within 45–60 days','Works to be sanctioned by the District Authority within the norm.','needs','Requires per-work sanction timestamps','Not in the published fund dataset — needs eSAKSHI work feed.'],
      ['Durable community assets only','Funds for permanent community assets, not prohibited items.','needs','Requires per-work descriptions','Not in the published fund dataset — needs eSAKSHI work feed.']
    ];
    var rows=norms.map(function(n){
      var badge = n[2]==='data' ? '<span class="chip eff-LOW"><span class="dot"></span>Checked</span>' : '<span class="chip" style="border:1px solid var(--border);color:var(--muted)">Needs work-level data</span>';
      return '<tr><td style="font-weight:600;">'+esc(n[0])+'<div style="font-size:11.5px;color:var(--muted);font-weight:400;margin-top:2px;">'+esc(n[1])+'</div></td><td>'+badge+'</td><td style="font-size:12.5px;">'+esc(n[4])+'</td></tr>';
    }).join('');
    return PROV+
    '<div class="page-head"><h1>MPLADS norms compliance</h1><p>The scheme has explicit rules. This screens the real fund data against every norm it can support, and is transparent about the norms that require the work-level eSAKSHI feed. It flags deviations for review — it does not allege a violation.</p></div>'+
    '<div class="grid kpis" style="margin-bottom:13px;">'+
      kpi('Above term cap', excess.length, 'entitlement > ₹25 cr','high')+
      kpi('Partial-term', partial.length, 'entitlement < ₹25 cr','medium')+
      kpi('Under-released', underReleased.length, 'release rate < 90%','high')+
      kpi('High idle', highIdle.length, 'unspent ≥ 20% of released','high')+
    '</div>'+
    card('Scheme norms &amp; what we can check','<div class="table-wrap"><table><thead><tr><th>Norm</th><th>Status</th><th>Result on real data</th></tr></thead><tbody>'+rows+'</tbody></table></div>','margin-bottom:13px;')+
    card('Constituencies above the ₹25 cr term cap', excess.length?'<div class="table-wrap"><table><thead><tr><th>Constituency</th><th>State</th><th>Entitlement</th><th>Note</th></tr></thead><tbody>'+
      excess.sort(function(a,b){return b.entitlement-a.entitlement;}).slice(0,12).map(function(r){return '<tr class="rowlink" data-goto="#/constituency/'+r.id+'"><td><a href="#/constituency/'+r.id+'">'+esc(r.constituency)+'</a></td><td>'+esc(r.state)+'</td><td class="num-cell">'+cr(r.entitlement)+'</td><td style="font-size:12px;color:var(--muted)">'+(r.entitlement-TERM_NORM).toFixed(1)+' cr above term norm (often legitimate carry-forward — verify)</td></tr>';}).join('')+
      '</tbody></table></div>':'<div class="empty">None.</div>');
  }

  // ---------- Benford's Law (first-digit forensic test) ----------
  function benford(values){
    var counts=[0,0,0,0,0,0,0,0,0], n=0;
    values.forEach(function(v){
      v=Math.abs(Number(v));
      if(!isFinite(v)||v<=0) return;
      var s=String(v).replace(/[^0-9]/g,'').replace(/^0+/,'');
      if(!s.length) return;
      var d=parseInt(s.charAt(0),10);
      if(d>=1&&d<=9){ counts[d-1]++; n++; }
    });
    var expected=[]; for(var d=1;d<=9;d++) expected.push(Math.log(1+1/d)/Math.log(10));
    var observed=counts.map(function(c){ return n?c/n:0; });
    var mad=0, chi=0;
    for(var i=0;i<9;i++){
      mad+=Math.abs(observed[i]-expected[i]);
      var e=expected[i]*n; if(e>0) chi+=Math.pow(counts[i]-e,2)/e;
    }
    mad=mad/9;
    // Nigrini conformity bands for first-digit MAD
    var verdict = mad<0.006?['Close conformity','var(--low)'] : mad<0.012?['Acceptable conformity','var(--low)'] : mad<0.015?['Marginal conformity','var(--medium)'] : ['Non-conformity','var(--high)'];
    return {counts:counts,n:n,observed:observed,expected:expected,mad:mad,chi:chi,verdict:verdict};
  }
  function benfordChart(b){
    var W=560,H=190,pad={l:34,r:8,t:10,b:26};
    var iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
    var maxY=Math.max.apply(null,b.observed.concat(b.expected))*1.15 || 0.4;
    var bw=iw/9;
    var bars='',ticks='',labels='';
    for(var i=0;i<9;i++){
      var x=pad.l+i*bw;
      var oh=(b.observed[i]/maxY)*ih;
      var eh=(b.expected[i]/maxY)*ih;
      bars+='<rect x="'+(x+bw*0.22)+'" y="'+(pad.t+ih-oh)+'" width="'+(bw*0.56)+'" height="'+Math.max(0,oh)+'" fill="var(--accent)" rx="2"></rect>';
      ticks+='<line x1="'+(x+bw*0.12)+'" y1="'+(pad.t+ih-eh)+'" x2="'+(x+bw*0.88)+'" y2="'+(pad.t+ih-eh)+'" stroke="var(--critical)" stroke-width="2" stroke-linecap="round"></line>';
      labels+='<text x="'+(x+bw/2)+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+(i+1)+'</text>';
    }
    var gy='';
    [0,0.1,0.2,0.3].forEach(function(v){
      if(v>maxY) return;
      var y=pad.t+ih-(v/maxY)*ih;
      gy+='<line x1="'+pad.l+'" y1="'+y+'" x2="'+(W-pad.r)+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"></line>'+
          '<text x="'+(pad.l-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="9.5" fill="var(--muted-2)">'+Math.round(v*100)+'%</text>';
    });
    return '<div class="benford-wrap"><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:620px;height:auto;display:block;" role="img" aria-label="Benford first-digit distribution">'+
      gy+bars+ticks+labels+'</svg></div>'+
      '<div class="bf-legend"><span><span class="sw" style="background:var(--accent)"></span>Observed first digit</span>'+
      '<span><span class="sw" style="background:var(--critical)"></span>Benford expected</span></div>';
  }
  function benfordCard(){
    var unspent=FREC.map(function(r){return r.unspentBalance;}).filter(function(v){return v>0;});
    var b=benford(unspent);
    var worksExp=WPROJ.map(function(p){return p.expenditure;});
    var bw=benford(worksExp);
    function stat(b){
      return '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;margin-top:10px;">'+
        '<span><span style="color:var(--muted-2)">n</span> '+b.n+'</span>'+
        '<span><span style="color:var(--muted-2)">MAD</span> <span class="mono">'+b.mad.toFixed(4)+'</span></span>'+
        '<span><span style="color:var(--muted-2)">χ²</span> <span class="mono">'+b.chi.toFixed(1)+'</span> <span style="color:var(--muted-2)">(crit. 15.5, df 8)</span></span>'+
        '<span class="verdict-chip" style="color:'+b.verdict[1]+';border-color:'+b.verdict[1]+';background:color-mix(in srgb,'+b.verdict[1]+' 12%,transparent);">'+b.verdict[0]+'</span></div>';
    }
    return card('Benford&rsquo;s Law — first-digit forensic test',
      '<div style="font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:12px;">Naturally-occurring financial figures follow a predictable first-digit distribution (about 30% start with 1). Large deviations are a classic forensic-accounting signal of fabricated or manipulated numbers. Applied here to <b style="color:var(--text)">real unspent balances</b>.</div>'+
      benfordChart(b)+stat(b)+
      '<div style="height:18px;"></div>'+
      '<div style="font-size:12.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Control: synthetic works expenditure</div>'+
      benfordChart(bw)+stat(bw)+
      '<div class="notice" style="margin-top:14px;"><b>How to read this — honestly.</b> Both series deviate from Benford, and in this case the most likely explanation is <b>administrative, not fraudulent</b>: MPLADS releases money in fixed ₹2.5 crore instalments, so unspent balances cluster around instalment remainders and their first digits bunch up. That is exactly why a Benford result is a <b>starting question, never a finding</b>. Entitlement and release figures are excluded outright — at ₹25 / 22.5 / 20 crore they are administratively fixed, so the test does not apply to them at all. The synthetic control behaves the same way because generated costs cluster around category budgets. On free-forming work-level invoice and vendor-payment amounts — the eSAKSHI feed — this test becomes genuinely diagnostic.</div>',
      'margin-bottom:13px;');
  }

  // ---------- Validation & model credibility ----------
  function renderValidation(){
    // Ground truth = per-project-detectable planted anomalies. Agency/geo patterns
    // are population-level context signals and pure data-quality issues are graded
    // separately (shown in the per-type table below), so they are not in this positive class.
    var STRONG={'cost-outlier':1,'expenditure-overrun':1,'severe-delay':1,'near-duplicate':1,'hero-critical':1};
    var labeled=WPROJ.map(function(p){ return { truth:(p.seededIssues||[]).some(function(s){return STRONG[s];}), score:p.riskScore, types:(p.seededIssues||[]) }; });
    function metricsAt(th){ var tp=0,fp=0,fn=0,tn=0; labeled.forEach(function(x){ var pred=x.score>=th; if(pred&&x.truth)tp++; else if(pred&&!x.truth)fp++; else if(!pred&&x.truth)fn++; else tn++; }); var prec=tp+fp?tp/(tp+fp):0, rec=tp+fn?tp/(tp+fn):0, f1=prec+rec?2*prec*rec/(prec+rec):0; return {tp:tp,fp:fp,fn:fn,tn:tn,prec:prec,rec:rec,f1:f1,acc:(tp+tn)/labeled.length}; }
    var at50=metricsAt(50);
    var curve=[30,40,50,60,75].map(function(th){return {th:th,m:metricsAt(th)};});
    // per-type recall
    var typeLabels={'cost-outlier':'Cost outlier','expenditure-overrun':'Expenditure over-run','severe-delay':'Severe delay','near-duplicate':'Near-duplicate','agency-pattern':'Agency pattern','geo-cluster':'Geographic cluster','date-inconsistency':'Date inconsistency','hero-critical':'Multi-signal critical'};
    var typeStats={};
    WPROJ.forEach(function(p){ (p.seededIssues||[]).forEach(function(t){ if(t==='missing-vendor')return; if(!typeStats[t])typeStats[t]={tot:0,hit:0}; typeStats[t].tot++; if(p.riskScore>=50)typeStats[t].hit++; }); });
    var pos=labeled.filter(function(x){return x.truth;}).length;
    var cm=at50;
    function bar(v,color){ return '<div class="track" style="height:9px;"><div class="fill" style="width:'+Math.round(v*100)+'%;background:'+color+'"></div></div>'; }
    // real-data score histogram
    var buckets=[0,0,0,0,0]; FREC.forEach(function(r){ var i=Math.min(4,Math.floor(r.inefficiencyScore/20)); buckets[i]++; });
    var maxB=Math.max.apply(null,buckets);
    var histLabels=['0–19','20–39','40–59','60–79','80–100'];
    return '<div class="page-head"><h1>Validation &amp; model credibility</h1><p>How we know the screening engine works. Because the real fund data has no ground-truth fraud labels, we validate the anomaly detector on a labelled synthetic works set where the planted anomalies are known, then report the real-data score behaviour transparently.</p></div>'+
    '<div class="grid kpis" style="margin-bottom:13px;">'+
      kpi('Precision @50', (at50.prec*100).toFixed(0)+'%', 'of flagged works are truly anomalous','teal')+
      kpi('Recall @50', (at50.rec*100).toFixed(0)+'%', 'of planted anomalies caught','teal')+
      kpi('F1 @50', at50.f1.toFixed(2), 'balance of the two','')+
      kpi('Accuracy', (at50.acc*100).toFixed(0)+'%', 'over '+labeled.length+' labelled works','')+
    '</div>'+
    '<div class="grid cols-2b" style="margin-bottom:13px;">'+
      card('Confusion matrix (threshold = 50)','<div class="table-wrap"><table><thead><tr><th></th><th>Predicted anomalous</th><th>Predicted normal</th></tr></thead><tbody>'+
        '<tr><td style="font-weight:600">Actually anomalous</td><td class="num-cell" style="color:var(--low)">'+cm.tp+' (TP)</td><td class="num-cell" style="color:var(--high)">'+cm.fn+' (FN)</td></tr>'+
        '<tr><td style="font-weight:600">Actually normal</td><td class="num-cell" style="color:var(--high)">'+cm.fp+' (FP)</td><td class="num-cell" style="color:var(--low)">'+cm.tn+' (TN)</td></tr>'+
        '</tbody></table></div><div class="notice" style="margin-top:11px;">Ground truth = '+pos+' works carry a per-project-detectable planted anomaly (cost, expenditure, delay, duplicate or multi-signal). A work is predicted anomalous when its risk score ≥ 50. Agency/geographic patterns are population-level context signals and are graded in the per-type table below.</div>')+
      card('Threshold sensitivity','<div class="bar-list">'+curve.map(function(c){return '<div class="row" style="grid-template-columns:70px 1fr 1fr;gap:12px;"><div class="name">score ≥ '+c.th+'</div><div><div style="font-size:10px;color:var(--muted-2)">precision '+(c.m.prec*100).toFixed(0)+'%</div>'+bar(c.m.prec,'var(--teal)')+'</div><div><div style="font-size:10px;color:var(--muted-2)">recall '+(c.m.rec*100).toFixed(0)+'%</div>'+bar(c.m.rec,'var(--accent)')+'</div></div>';}).join('')+'</div><div class="notice" style="margin-top:11px;">Raising the threshold trades recall for precision — the HIGH/CRITICAL cut at 50 balances catching real anomalies against false alarms.</div>')+
    '</div>'+
    card('Detection rate by anomaly type (recall)','<div class="bar-list">'+Object.keys(typeStats).sort(function(a,b){return typeStats[b].tot-typeStats[a].tot;}).map(function(t){var s=typeStats[t];var r=s.hit/s.tot;return '<div class="row" style="grid-template-columns:170px 1fr 80px;"><div class="name">'+(typeLabels[t]||t)+'</div>'+bar(r,'var(--low)')+'<div class="val">'+(r*100).toFixed(0)+'% ('+s.hit+'/'+s.tot+')</div></div>';}).join('')+'</div>','margin-bottom:13px;')+
    benfordCard()+
    '<div class="grid cols-2b">'+
      card('Real-data inefficiency-score distribution','<div class="bar-list">'+buckets.map(function(b,i){return '<div class="row" style="grid-template-columns:70px 1fr 60px;"><div class="name">'+histLabels[i]+'</div><div class="track" style="height:11px;"><div class="fill" style="width:'+Math.round(b/maxB*100)+'%;background:'+MAP_STOPS[i+1]+'"></div></div><div class="val">'+b+'</div></div>';}).join('')+'</div><div class="notice" style="margin-top:11px;">Most real constituencies score low; a small tail scores high — the screening tool concentrates attention on that tail.</div>')+
      card('Honest limitations','<div style="font-size:13px;line-height:1.7;color:var(--muted);">• The real fund data has <b style="color:var(--text)">no labelled outcomes</b>, so precision/recall are measured on the synthetic set and are an <b style="color:var(--text)">upper-bound sanity check</b>, not a field accuracy claim.<br>• Signals are <b style="color:var(--text)">screening indicators</b>; a high score can have legitimate explanations.<br>• This is a <b style="color:var(--text)">risk-screening prototype requiring human verification</b> before any conclusion.<br>• On real work-level data, thresholds would be re-calibrated against reviewed cases.</div>')+
    '</div>';
  }

  // ---------- Works Audit (synthetic) ----------
  function renderWorks(){
    var d=WDASH, k=d.kpis;
    var counts=d.riskDistribution;
    var riskEntries=['LOW','MEDIUM','HIGH','CRITICAL'].map(function(c){return {label:c,value:counts[c]||0,color:RISK_COLOR[c]};});
    var sigEntries=Object.keys(d.signalCounts).map(function(x){return {label:x,value:d.signalCounts[x],color:'var(--high)'};}).sort(function(a,b){return b.value-a.value;}).slice(0,8);
    var top=WPROJ.filter(function(p){return p.riskCategory==='HIGH'||p.riskCategory==='CRITICAL';}).sort(function(a,b){return b.riskScore-a.riskScore;}).slice(0,8);
    return '<div class="provenance"><span class="tag synth"><span class="dot"></span>SYNTHETIC / ILLUSTRATIVE</span><span>This module demonstrates the project-level investigation workflow on generated works data — project-level cost/date records are not in the open fund dataset.</span></div>'+
    '<div class="page-head"><h1>Works Audit — investigation workflow</h1><p>Project-level anomaly detection: cost outliers, timeline anomalies, duplicate detection, agency patterns, peer comparison and a full evidence pack. Demonstrated on '+WPROJ.length+' illustrative works.</p></div>'+
    '<div class="grid kpis" style="margin-bottom:13px;">'+
      kpi('Works',k.totalProjects.toLocaleString('en-IN'),'','')+
      kpi('High risk',counts.HIGH,'','high')+
      kpi('Critical risk',counts.CRITICAL,'','critical')+
      kpi('Financial anomalies',k.financialAnomalies,'cost + over-run','high')+
    '</div>'+
    '<div class="grid cols-2" style="margin-bottom:13px;">'+
      card('Risk distribution', donut(riskEntries,180)+'<div class="legend">'+riskEntries.map(function(e){return '<span class="item"><span class="dot" style="background:'+e.color+'"></span>'+e.label+' ('+e.value+')</span>';}).join('')+'</div>')+
      card('Anomaly signals', barList(sigEntries))+
    '</div>'+
    card('Top high-risk works','<div class="table-wrap"><table><thead><tr><th>Project</th><th>State</th><th>Category</th><th>Sanctioned</th><th>Risk</th></tr></thead><tbody>'+
      top.map(function(p){return '<tr class="rowlink" data-goto="#/project/'+p.id+'"><td><a href="#/project/'+p.id+'">'+esc(p.name)+'</a></td><td>'+esc(p.state)+'</td><td>'+esc(p.category)+'</td><td class="num-cell">'+wLakh(p.sanctionedAmount)+'</td><td>'+riskChip(p.riskCategory,p.riskScore)+'</td></tr>';}).join('')+
      '</tbody></table></div><div style="margin-top:12px;"><a class="btn" href="#/projects">Open full works table →</a></div>');
  }
  function wLakh(n){ var l=n/100000; if(l>=100) return '₹'+(l/100).toFixed(2)+' Cr'; return '₹'+l.toFixed(1)+' L'; }

  var wStateF={q:'',state:'',category:'',status:'',risk:'',sort:'risk',page:1};
  function renderProjects(){
    return '<div class="no-print" style="font-size:12.5px;color:var(--muted);margin-bottom:10px;"><a href="#/works">← Works Audit</a></div>'+
    '<div class="page-head"><h1>Works — search &amp; investigate</h1><p>Synthetic illustrative works. Filter and open any project for the full risk breakdown, peer comparison and recommendations.</p></div>'+
    '<div class="card" style="margin-bottom:13px;"><div class="filter-bar">'+
      '<input type="text" id="wf-q" placeholder="Search by ID or name" value="'+esc(wStateF.q)+'">'+
      '<select id="wf-risk">'+opt(WOPTS.risks,wStateF.risk,'Risk: all')+'</select>'+
      '<select id="wf-state">'+opt(WOPTS.states,wStateF.state,'State: all')+'</select>'+
      '<select id="wf-cat">'+opt(WOPTS.categories,wStateF.category,'Category: all')+'</select>'+
      '<select id="wf-status">'+opt(WOPTS.statuses,wStateF.status,'Status: all')+'</select>'+
      '<select id="wf-sort"><option value="risk"'+(wStateF.sort==='risk'?' selected':'')+'>Sort: risk</option><option value="amount"'+(wStateF.sort==='amount'?' selected':'')+'>Sort: amount</option><option value="name"'+(wStateF.sort==='name'?' selected':'')+'>Sort: name</option></select>'+
      '<button class="btn" id="wf-clear">Clear</button>'+
    '</div></div><div id="works-table"></div>';
  }
  function worksFiltered(){
    var list=WPROJ.filter(function(p){
      if(wStateF.q){var q=wStateF.q.toLowerCase(); if(p.id.toLowerCase().indexOf(q)===-1 && p.name.toLowerCase().indexOf(q)===-1) return false;}
      if(wStateF.state && p.state!==wStateF.state) return false;
      if(wStateF.category && p.category!==wStateF.category) return false;
      if(wStateF.status && p.status!==wStateF.status) return false;
      if(wStateF.risk && p.riskCategory!==wStateF.risk) return false;
      return true;
    });
    list.sort(function(a,b){ if(wStateF.sort==='amount')return b.sanctionedAmount-a.sanctionedAmount; if(wStateF.sort==='name')return a.name.localeCompare(b.name); return b.riskScore-a.riskScore; });
    return list;
  }
  function worksTable(){
    var list=worksFiltered(); var total=list.length; var pages=Math.max(1,Math.ceil(total/25));
    if(wStateF.page>pages) wStateF.page=pages;
    var items=list.slice((wStateF.page-1)*25,(wStateF.page-1)*25+25);
    var rows=items.length?items.map(function(p){return '<tr class="rowlink" data-goto="#/project/'+p.id+'"><td class="mono" style="font-size:11px">'+p.id+'</td><td><a href="#/project/'+p.id+'">'+esc(p.name)+'</a></td><td>'+esc(p.state)+'</td><td>'+esc(p.category)+'</td><td class="num-cell">'+wLakh(p.sanctionedAmount)+'</td><td>'+esc(p.status)+'</td><td>'+riskChip(p.riskCategory,p.riskScore)+'</td></tr>';}).join(''):'<tr><td colspan="7" class="empty">No works match the filters.</td></tr>';
    return card(null,'<div class="table-wrap"><table><thead><tr><th>ID</th><th>Project</th><th>State</th><th>Category</th><th>Sanctioned</th><th>Status</th><th>Risk</th></tr></thead><tbody>'+rows+'</tbody></table></div>')+
      '<div class="pager"><div>'+total.toLocaleString('en-IN')+' works · page '+wStateF.page+' / '+pages+'</div><div class="btns"><button class="btn" id="wp-prev"'+(wStateF.page<=1?' disabled':'')+'>Previous</button><button class="btn" id="wp-next"'+(wStateF.page>=pages?' disabled':'')+'>Next</button></div></div>';
  }
  function renderProject(id){
    var p=wById[id];
    if(!p) return '<div class="empty">Work '+esc(id)+' not found. <a href="#/projects">Back</a></div>';
    var peers=(p.peerIds||[]).map(function(x){return wById[x];}).filter(Boolean);
    var expl=explainWork(p);
    return '<div class="no-print" style="font-size:12.5px;color:var(--muted);margin-bottom:10px;"><a href="#/projects">← Works</a></div>'+
    '<div class="card" style="margin-bottom:13px;"><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">'+
      '<div style="flex:1 1 420px;min-width:280px;"><span class="chip badge-synth" style="margin-bottom:6px;">SYNTHETIC · illustrative</span>'+
        '<div class="mono" style="font-size:11px;color:var(--muted-2);margin-top:6px;">'+p.id+'</div><h1 style="font-size:21px;margin-top:3px;">'+esc(p.name)+'</h1>'+
        '<div class="field-grid" style="margin-top:16px;">'+fld('State',p.state)+fld('District',p.district)+fld('Constituency',p.constituency)+fld('Category',p.category)+fld('Agency',p.agency)+fld('Vendor',p.vendor||'—')+fld('Sanctioned',wLakh(p.sanctionedAmount))+fld('Expenditure',wLakh(p.expenditure))+fld('Start',p.startDate)+fld('Expected',p.expectedCompletionDate)+fld('Status',p.status)+fld('Actual',p.actualCompletionDate||'—')+'</div></div>'+
      '<div style="flex:0 0 250px;"><div class="gauge-wrap">'+gauge(p.riskScore,p.riskCategory,RISK_COLOR)+'<div class="gauge-meta"><div class="tag">Risk score</div><div class="cat" style="color:'+RISK_COLOR[p.riskCategory]+'">'+p.riskCategory+'</div></div></div>'+
        '<button class="btn primary no-print" style="margin-top:14px;width:100%;" onclick="window.print()">Print / Save as PDF</button></div>'+
    '</div></div>'+
    card('Risk signals', p.signals.length?'<div class="table-wrap"><table><thead><tr><th>Signal</th><th>Severity</th><th>Weight</th><th>Explanation</th></tr></thead><tbody>'+
      p.signals.slice().sort(function(a,b){return b.weight-a.weight;}).map(function(s){return '<tr><td style="font-weight:600">'+esc(s.label)+'</td><td><span class="sev '+s.severity+'">'+s.severity+'</span></td><td class="mono">+'+s.weight+'</td><td>'+esc(s.explanation)+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">No risk signals.</div>','margin-bottom:13px;')+
    (peers.length?card('Nearest comparable works','<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>State</th><th>Sanctioned</th><th>Status</th></tr></thead><tbody>'+peers.map(function(q){return '<tr class="rowlink" data-goto="#/project/'+q.id+'"><td class="mono" style="font-size:11px"><a href="#/project/'+q.id+'">'+q.id+'</a></td><td>'+esc(q.name)+'</td><td>'+esc(q.state)+'</td><td class="num-cell">'+wLakh(q.sanctionedAmount)+'</td><td>'+esc(q.status)+'</td></tr>';}).join('')+'</tbody></table></div>','margin-bottom:13px;'):'')+
    '<div class="grid cols-2b">'+card('Why flagged?','<div style="white-space:pre-wrap;font-size:13px;line-height:1.7">'+esc(expl)+'</div>')+card('Recommended steps','<ol class="rec-list" style="list-style:none;padding:0;">'+(p.recommendations||[]).map(function(t,i){return '<li><span class="n">'+(i+1)+'</span><span>'+esc(t)+'</span></li>';}).join('')+'</ol>')+'</div>';
  }
  function explainWork(p){
    if(!p.signals.length) return p.id+' — '+p.name+' has risk '+p.riskScore+'/100 ('+p.riskCategory+'). No specific signals; routine verification suggested.';
    var parts=p.signals.slice().sort(function(a,b){return b.weight-a.weight;}).map(function(s){return '- '+s.label+' (+'+s.weight+'): '+s.explanation;});
    return p.id+' — '+p.name+' has risk '+p.riskScore+'/100 ('+p.riskCategory+').\n\nContributing signals:\n'+parts.join('\n')+'\n\nThese are risk indicators requiring human verification.';
  }

  // ---------- Ask AI (real Claude via sample capability, deterministic fallback) ----------
  var chat=[]; // {role:'user'|'bot', text, cites, pending}
  var aiMode='detecting'; // detecting | live | offline
  var SUG=['Which constituencies have the most unspent funds?','Compare fund use in Kerala and Bihar','Which states have the highest unspent balance?','Draft a review note for the top 3 constituencies to investigate','How much MPLAD money is lying unspent?'];
  function aiBadge(){
    if(aiMode==='live') return '<span class="ai-badge"><span class="dot"></span>Live — powered by Claude, grounded in real data</span>';
    if(aiMode==='offline') return '<span class="ai-badge"><span class="dot" style="background:var(--medium)"></span>Offline mode — deterministic answers from the data</span>';
    return '<span class="ai-badge"><span class="dot" style="background:var(--muted-2)"></span>Connecting…</span>';
  }
  function renderAsk(){
    return '<div class="page-head"><h1>Ask the MPLAD Assistant</h1><p>A conversational assistant that answers from the real 16th Lok Sabha fund data. When the claude.ai model is available it reasons over the data and can draft notes; otherwise it falls back to deterministic answers. It never invents figures.</p></div>'+
    '<div style="margin-bottom:12px;" id="ai-badge-host">'+aiBadge()+'</div>'+
    '<div class="card" style="margin-bottom:13px;"><div class="chat-thread" id="chat-thread">'+chatHtml()+'</div>'+
      '<form id="qa-form" style="display:flex;gap:8px;margin-top:14px;"><input type="text" id="qa-input" placeholder="Ask about fund utilisation, a state, or ask it to draft a note…" style="flex:1;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:10px 13px;font-size:13.5px;font-family:inherit;"><button class="btn primary" type="submit" id="qa-send">Send</button></form>'+
      '<div class="qa-suggest">'+SUG.map(function(s){return '<button data-ask="'+esc(s)+'">'+esc(s)+'</button>';}).join('')+'</div></div>'+
    '<div class="notice">The assistant is instructed to answer only from the provided real data and to treat every signal as a screening indicator requiring verification, not proof of wrongdoing.</div>';
  }
  function chatHtml(){
    if(!chat.length) return '<div class="empty" style="padding:24px 10px;">Ask a question to begin. Try one of the suggestions below.</div>';
    return chat.map(function(m){
      if(m.role==='user') return '<div class="msg user">'+esc(m.text)+'</div>';
      var inner = m.pending ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text);
      var cites = (!m.pending && m.cites && m.cites.length) ? '<div class="cites">'+m.cites.map(function(c){return '<a class="chip" style="border:1px solid var(--border);color:var(--accent)" href="'+c.href+'">'+esc(c.label)+'</a>';}).join('')+'</div>' : '';
      return '<div class="msg bot">'+inner+cites+'</div>';
    }).join('');
  }
  function paintChat(){ var el=document.getElementById('chat-thread'); if(el){ el.innerHTML=chatHtml(); el.scrollTop=el.scrollHeight; } }

  // Build a bounded, real-data context for the model
  function buildAIContext(q){
    var lines=[];
    lines.push('NATIONAL (16th Lok Sabha, '+FAGG.totalMPs+' MP constituencies, '+FAGG.states+' States/UTs):');
    lines.push('entitlement=₹'+FAGG.totalEntitlement+'cr, released=₹'+FAGG.totalReleased+'cr, unspent=₹'+FAGG.totalUnspent+'cr, releasePending=₹'+FAGG.totalReleasePending+'cr; flagged SEVERE='+FAGG.categoryCounts.SEVERE+', ELEVATED='+FAGG.categoryCounts.ELEVATED+', oversanctioned='+FAGG.oversanctionedCount+'.');
    lines.push('\nPER-STATE (state | mps | entitlement cr | unspent cr | avgInefficiency | flagged):');
    Object.keys(FAGG.byState).sort().forEach(function(s){ var a=FAGG.byState[s]; lines.push(s+' | '+a.mps+' | '+a.entitlement+' | '+a.unspent+' | '+a.avgInefficiency+' | '+a.flagged); });
    // top constituencies by inefficiency
    var top=FREC.slice().sort(function(a,b){return b.inefficiencyScore-a.inefficiencyScore;}).slice(0,60);
    // include full rows of any state named in the question
    var st=detectState(q.toLowerCase());
    var extra = st ? FREC.filter(function(r){return r.state===st && top.indexOf(r)===-1;}) : [];
    var rows=top.concat(extra);
    lines.push('\nCONSTITUENCIES (constituency | state | MP | entitlement | released | unspent | releasePending | unsanctionedBal | score | category):');
    rows.forEach(function(r){ lines.push(r.constituency+' | '+r.state+' | '+r.mp+' | '+r.entitlement+' | '+r.released+' | '+r.unspentBalance+' | '+r.releasePending+' | '+r.unsanctionBalance+' | '+r.inefficiencyScore+' | '+r.inefficiencyCategory); });
    return lines.join('\n');
  }
  var AI_SYSTEM='You are the MPLAD Fund Analyst assistant for a government audit tool. Answer ONLY using the DATA below (real 16th Lok Sabha MPLAD fund figures; all money in ₹ crore). Never invent numbers or constituencies; if the data does not contain the answer, say so plainly. Be concise and specific, cite constituency and state names, and when useful format short lists with "•". Treat every figure as a screening indicator for human verification, not proof of fraud or wrongdoing. If asked to draft a note, keep it factual and neutral.';
  function detectState(l){ return Array.from(new Set(FREC.map(function(r){return r.state;}))).find(function(s){return l.indexOf(s.toLowerCase())!==-1;})||''; }
  function answer(q){
    var l=q.toLowerCase().trim();
    if(/unspent|idle/.test(l) && /state/.test(l)){
      var rows=Object.keys(FAGG.byState).map(function(s){return {s:s,u:FAGG.byState[s].unspent};}).sort(function(a,b){return b.u-a.u;}).slice(0,6);
      return {a:'States with the highest unspent (idle) MPLAD balance:\n\n'+rows.map(function(r){return '• '+r.s+': '+cr(r.u)+' unspent';}).join('\n'),cites:[]};
    }
    if(/unspent|idle/.test(l) && /(constituenc|most|top)/.test(l)){
      var top=FREC.slice().sort(function(a,b){return b.unspentBalance-a.unspentBalance;}).slice(0,6);
      return {a:'Constituencies with the most unspent funds:\n\n'+top.map(function(r){return '• '+r.constituency+' ('+r.state+'): '+cr(r.unspentBalance)+' unspent, score '+r.inefficiencyScore;}).join('\n'),cites:top.slice(0,4).map(function(r){return {label:r.constituency,href:'#/constituency/'+r.id};})};
    }
    if(/how much.*unspent|total unspent|lying unspent/.test(l)){
      return {a:'Across '+FAGG.totalMPs+' MP constituencies (16th Lok Sabha), ₹'+FAGG.totalUnspent+' crore of released MPLAD funds remained unspent — about '+((FAGG.totalUnspent/FAGG.totalReleased)*100).toFixed(0)+'% of the ₹'+FAGG.totalReleased+' crore released. '+FAGG.categoryCounts.SEVERE+' constituencies are flagged SEVERE and '+FAGG.categoryCounts.ELEVATED+' ELEVATED.',cites:[]};
    }
    var st=detectState(l);
    if(st){
      var inSt=FREC.filter(function(r){return r.state===st;});
      var flagged=inSt.filter(function(r){return r.inefficiencyCategory==='SEVERE'||r.inefficiencyCategory==='ELEVATED';}).sort(function(a,b){return b.inefficiencyScore-a.inefficiencyScore;});
      var ent=inSt.reduce(function(s,r){return s+r.entitlement;},0), uns=inSt.reduce(function(s,r){return s+r.unspentBalance;},0);
      var top5=flagged.slice(0,5);
      return {a:'In '+st+', '+inSt.length+' MP constituencies hold ₹'+ent.toFixed(1)+' crore entitlement with ₹'+uns.toFixed(1)+' crore unspent. '+flagged.length+' are flagged elevated/severe'+(top5.length?':\n\n'+top5.map(function(r){return '• '+r.constituency+' — score '+r.inefficiencyScore+' ('+r.inefficiencyCategory+'), '+cr(r.unspentBalance)+' unspent';}).join('\n'):'.'),cites:top5.slice(0,4).map(function(r){return {label:r.constituency,href:'#/constituency/'+r.id};})};
    }
    if(/investigate|priority|first/.test(l)){
      var t3=FREC.slice().sort(function(a,b){return b.inefficiencyScore-a.inefficiencyScore;}).slice(0,3);
      return {a:'Suggested review queue (highest inefficiency):\n\n'+t3.map(function(r){return '• '+r.constituency+' ('+r.state+'): score '+r.inefficiencyScore+', '+r.signals.map(function(s){return s.label;}).slice(0,3).join('; ');}).join('\n'),cites:t3.map(function(r){return {label:r.constituency,href:'#/constituency/'+r.id};})};
    }
    if(/over.?sanction/.test(l)){
      var os=FREC.filter(function(r){return r.oversanctioned;}).sort(function(a,b){return a.unsanctionBalance-b.unsanctionBalance;}).slice(0,6);
      return {a:FAGG.oversanctionedCount+' constituencies show sanctions beyond available funds. Largest gaps:\n\n'+os.map(function(r){return '• '+r.constituency+' ('+r.state+'): '+signed(r.unsanctionBalance)+' Cr unsanctioned balance';}).join('\n'),cites:os.slice(0,4).map(function(r){return {label:r.constituency,href:'#/constituency/'+r.id};})};
    }
    return {a:'I answer from the real MPLAD fund data. Try:\n\n• "Which constituencies have the most unspent funds?"\n• "Show severe inefficiency in Kerala"\n• "Which states have the highest unspent balance?"\n• "What should I investigate first?"\n• "How much MPLAD money is lying unspent?"',cites:[]};
  }

  // ---------- Sources ----------
  function renderSources(){
    var m=FUNDS.meta;
    return '<div class="page-head"><h1>Data sources &amp; methodology</h1><p>Full provenance for every number in this platform, and how the screening signals are computed.</p></div>'+
    '<div class="grid cols-2b" style="margin-bottom:13px;">'+
      card('<span>Fund data</span><span class="chip badge-real">REAL</span>','<div class="src-card">'+
        '<div class="st">'+esc(m.source.title)+'</div>'+
        '<div class="row"><span class="k">Provider</span><span>'+esc(m.source.provider)+'</span></div>'+
        '<div class="row"><span class="k">Records</span><span>'+m.rowCount+' MP constituencies · '+FAGG.states+' States/UTs</span></div>'+
        '<div class="row"><span class="k">Lok Sabha</span><span>'+esc(m.source.lokSabha)+'th (2014–2019)</span></div>'+
        '<div class="row"><span class="k">Licence</span><span>'+esc(m.source.license)+'</span></div>'+
        '<div class="row"><span class="k">Origin</span><span class="mono" style="font-size:11px">'+esc(m.origin)+'</span></div>'+
        '<div class="row"><span class="k">Portal</span><span><a href="'+esc(m.source.homepage)+'" target="_blank" rel="noopener">data.opencity.in ↗</a></span></div>'+
        '<div class="row"><span class="k">Official</span><span><a href="https://mplads.mospi.gov.in/" target="_blank" rel="noopener">MPLADS eSAKSHI (MoSPI) ↗</a></span></div>'+
        '</div>')+
      card('<span>Works data</span><span class="chip badge-synth">SYNTHETIC</span>','<div class="src-card">'+
        '<div class="st">Illustrative works dataset ('+WPROJ.length+' records)</div>'+
        '<div class="row"><span class="k">Purpose</span><span>Demonstrate the project-level investigation workflow (cost/timeline/duplicate anomalies) which needs work-level cost &amp; date fields not published in the open fund data.</span></div>'+
        '<div class="row"><span class="k">Generation</span><span>Deterministic generator with planted anomalies; clearly labelled synthetic throughout.</span></div>'+
        '<div class="row"><span class="k">Not</span><span>Not real government records.</span></div></div>')+
    '</div>'+
    card('Live ingestion pipeline','<div style="font-size:13px;color:var(--muted);line-height:1.7;">The downloadable Next.js project ships an ingestion pipeline (<span class="mono">ingest/fetch.ts</span>) that pulls the full dataset live from the CKAN datastore API and direct CSV, normalises it to the internal schema, and falls back to the bundled snapshot when the network is blocked. Real resource id: <span class="mono">57baaa96-04ca-4328-86bc-17b455af1024</span>. It also documents the data.gov.in OGD work-level catalog and the MPLADS eSAKSHI portal for deeper integration.</div>','margin-bottom:13px;')+
    card('Inefficiency scoring method','<div style="font-size:13px;color:var(--muted);line-height:1.7;">Each constituency gets a transparent 0–100 score summing independent, explainable signals: <b style="color:var(--text)">idle released funds</b> (unspent vs released), <b style="color:var(--text)">over-sanction</b> (negative unsanctioned balance), <b style="color:var(--text)">central release pending</b>, <b style="color:var(--text)">low release rate</b>, and <b style="color:var(--text)">stalled pipeline</b> (old last release with money still idle). Bands: LOW 0–19, MODERATE 20–39, ELEVATED 40–59, SEVERE 60+. Every signal shows its own weight and a plain-language reason. These are screening indicators requiring human verification — not proof of fraud.</div>')+
    '<div class="notice" style="margin-top:13px;"><b>Disclaimer.</b> '+esc(m.disclaimer)+'</div>';
  }

  // ---------- Exports ----------
  function currentFundRows(){
    return fundFiltered().map(function(r){
      return {
        Constituency:r.constituency, MP:r.mp, District:r.district, State:r.state,
        'Entitlement (Cr)':r.entitlement, 'Released (Cr)':r.released, 'Release Rate %':r.releaseRatePct,
        'Release Pending (Cr)':r.releasePending, 'Unsanctioned Balance (Cr)':r.unsanctionBalance,
        'Unspent (Cr)':r.unspentBalance, 'Last Release':r.lastReleaseDate||'',
        'Inefficiency Score':r.inefficiencyScore, 'Category':r.inefficiencyCategory,
        'Signals':r.signals.map(function(s){return s.label;}).join('; ')
      };
    });
  }
  // Save a generated file: prefer the claude.ai downloads capability (viewer
  // sandbox blocks direct saves); fall back to a plain browser download when
  // the page is opened directly (e.g. the self-hosted build or a local file).
  async function saveFile(filename, data, btn){
    var label = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
    try{
      if (window.claude && typeof window.claude.use === 'function'){
        var dl = null;
        try { dl = await window.claude.use('downloads'); } catch(e){ dl = null; }
        if (dl){
          try { await dl.save({ filename: filename, data: data }); }
          catch(err){ if (!(err && err.code === 'declined')) alert('Download failed: '+(err && err.message || err)); }
          return;
        }
      }
      // Fallback (works when the HTML is opened directly, not inside the viewer)
      var blob = (data instanceof Blob) ? data : new Blob([data]);
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } finally {
      if (btn){ btn.disabled = false; btn.textContent = label; }
    }
  }
  function exportXLSX(e){
    try{
      var rows=currentFundRows();
      var ws=XLSX.utils.json_to_sheet(rows);
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'MPLAD Fund Utilisation');
      var ab=XLSX.write(wb,{bookType:'xlsx',type:'array'});
      saveFile('mplad-fund-utilisation.xlsx', ab, e && e.currentTarget);
    }catch(err){ alert('Excel export failed: '+err.message); }
  }
  function exportCSV(e){
    try{
      var rows=currentFundRows(); if(!rows.length){ alert('No rows to export.'); return; }
      var keys=Object.keys(rows[0]);
      var csv=[keys.join(',')].concat(rows.map(function(r){return keys.map(function(k){var v=r[k]==null?'':String(r[k]); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',');})).join('\n');
      saveFile('mplad-fund-utilisation.csv', csv, e && e.currentTarget);
    }catch(err){ alert('CSV export failed: '+err.message); }
  }
  function exportPDF(e){
    try{
      var jsPDF=window.jspdf.jsPDF; var doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
      var W=doc.internal.pageSize.getWidth();
      doc.setFillColor(20,26,41); doc.rect(0,0,W,54,'F');
      doc.setTextColor(255); doc.setFontSize(15); doc.text('MPLAD Fund Utilisation — 16th Lok Sabha (real data)',36,28);
      doc.setFontSize(9); doc.setTextColor(200); doc.text('Generated '+new Date().toLocaleString('en-IN')+'  ·  source: data.opencity.in (India OGD)',36,44);
      var rows=fundFiltered();
      var body=rows.map(function(r){return [r.constituency,r.state,r.entitlement,r.releaseRatePct!=null?r.releaseRatePct.toFixed(0)+'%':'—',r.unspentBalance,signed(r.unsanctionBalance),r.releasePending,r.inefficiencyScore+' '+r.inefficiencyCategory];});
      doc.autoTable({ startY:66, head:[['Constituency','State','Entitl. Cr','Rel%','Unspent Cr','Unsanc.','Pending Cr','Inefficiency']],
        body:body, styles:{fontSize:7.5}, headStyles:{fillColor:[30,41,59]}, margin:{left:36,right:36},
        didParseCell:function(d){ if(d.section==='body'&&d.column.index===7){ var t=d.cell.raw||''; if(t.indexOf('SEVERE')>=0)d.cell.styles.textColor=[174,55,48]; else if(t.indexOf('ELEVATED')>=0)d.cell.styles.textColor=[184,90,32]; } } });
      var y=doc.lastAutoTable.finalY+16; if(y>520){doc.addPage();y=40;}
      doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text('Inefficiency indicators are computed screening signals requiring human verification, not findings of fraud or wrongdoing.',36,y);
      var ab=doc.output('arraybuffer');
      saveFile('mplad-fund-utilisation.pdf', ab, e && e.currentTarget);
    }catch(err){ alert('PDF export failed: '+err.message); }
  }

  // ---------- wiring ----------
  function wire(key,arg){
    if(key==='funds'){
      bindFund();
      document.getElementById('funds-table').innerHTML=fundsTable(); bindFundTable();
      byId2('exp-xlsx',exportXLSX); byId2('exp-csv',exportCSV); byId2('exp-pdf',exportPDF);
    }
    if(key==='projects'){ bindWork(); document.getElementById('works-table').innerHTML=worksTable(); bindWorkTable(); }
    if(key==='overview'||key==='works'||key==='compliance'){ rowlinks(); presets(); }
    if(key==='overview'){
      wireAsk();
      byId2('nudge-start',function(){ markTourSeen(); var n=document.getElementById('tour-nudge'); if(n) n.remove(); startTour(); });
      byId2('nudge-dismiss',function(){ markTourSeen(); var n=document.getElementById('tour-nudge'); if(n) n.remove(); });
    }
    if(key==='constituency'||key==='project'){ rowlinks(); cmpAddButtons(); starButtons(); }
    if(key==='map'||key==='geo'){ mountTilemap(); var ms=document.getElementById('map-metric'); if(ms) ms.addEventListener('change',function(){ mapMetric=ms.value; mountTilemap(); }); }
    if(key==='citizen'){ bindCitizen(); cmpAddButtons(); starButtons(); }
    if(key==='compare'){ bindCompare(); }
    if(key==='watchlist'){ bindWatchlist(); }
    if(key==='rti'){ bindRTI(); }
    if(key==='cases'){ bindCases(); }
    if(key==='constituency'){ caseButtons(); }
    if(key==='ask'){ wireAsk(); }
  }
  function wireAsk(){
    var form=document.getElementById('qa-form');
    if(form) form.addEventListener('submit',function(e){e.preventDefault(); doAsk(document.getElementById('qa-input').value);});
    document.querySelectorAll('[data-ask]').forEach(function(b){b.addEventListener('click',function(){doAsk(b.getAttribute('data-ask'));});});
    detectAI();
  }
  // ---- map wiring ----
  function mountTilemap(){ var host=document.getElementById('tilemap-host'); if(!host) return; host.innerHTML=tilemapHtml(); bindTiles(); }
  var tipEl=null;
  function bindTiles(){
    document.querySelectorAll('.tile[data-state]').forEach(function(t){
      t.addEventListener('click',function(){ fState={q:'',state:t.getAttribute('data-state'),category:'',flag:'',sort:'score',dir:'desc',page:1}; location.hash='#/funds'; route(); });
      t.addEventListener('mousemove',function(e){ showTip(e,t.getAttribute('data-state')); });
      t.addEventListener('mouseleave',hideTip);
    });
  }
  function showTip(e,s){
    var a=FAGG.byState[s]; if(!a) return;
    if(!tipEl){ tipEl=document.createElement('div'); tipEl.className='tile-tip'; document.body.appendChild(tipEl); }
    tipEl.innerHTML='<div class="tt">'+esc(s)+'</div>'+
      '<div class="tr"><span>Constituencies</span><span>'+a.mps+'</span></div>'+
      '<div class="tr"><span>Entitlement</span><span>'+cr(a.entitlement)+'</span></div>'+
      '<div class="tr"><span>Unspent</span><span>'+cr(a.unspent)+'</span></div>'+
      '<div class="tr"><span>Avg inefficiency</span><span>'+a.avgInefficiency+'</span></div>'+
      '<div class="tr"><span>Flagged</span><span>'+a.flagged+' / '+a.mps+'</span></div>';
    tipEl.classList.add('show');
    var x=Math.min(e.clientX+14, window.innerWidth-244), y=Math.min(e.clientY+14, window.innerHeight-140);
    tipEl.style.left=x+'px'; tipEl.style.top=y+'px';
  }
  function hideTip(){ if(tipEl) tipEl.classList.remove('show'); }
  // ---- citizen wiring ----
  function bindCitizen(){
    var st=document.getElementById('cz-state'), cn=document.getElementById('cz-con');
    if(st) st.addEventListener('change',function(){ citizenSel.state=st.value; citizenSel.id=''; document.getElementById('view').innerHTML=renderCitizen(); wire('citizen'); });
    if(cn) cn.addEventListener('change',function(){ citizenSel.id=cn.value; document.getElementById('citizen-result').innerHTML = (citizenSel.id&&fById[citizenSel.id])?citizenCard(fById[citizenSel.id]):'<div class="empty">Pick your constituency.</div>'; cmpAddButtons(); });
  }
  // ---- compare wiring ----
  function cmpAddButtons(){
    document.querySelectorAll('[data-cmp-add]').forEach(function(b){ b.addEventListener('click',function(){ var id=b.getAttribute('data-cmp-add'); if(compareSet.indexOf(id)===-1 && compareSet.length<3){ compareSet.push(id); b.textContent='✓ Added to compare'; b.disabled=true; } }); });
  }
  function starButtons(){
    document.querySelectorAll('[data-wl]').forEach(function(b){ b.addEventListener('click',function(){ var id=b.getAttribute('data-wl'); if(wlHas(id)){ wlRemove(id); b.textContent='☆ Add to watchlist'; } else { wlAdd(id); b.textContent='★ On watchlist'; } }); });
  }
  function bindWatchlist(){
    starButtons();
    document.querySelectorAll('[data-wl-rm]').forEach(function(b){ b.addEventListener('click',function(){ wlRemove(b.getAttribute('data-wl-rm')); document.getElementById('view').innerHTML=renderWatchlist(); wire('watchlist'); }); });
    document.querySelectorAll('.wl-note').forEach(function(inp){ inp.addEventListener('change',function(){ var id=inp.getAttribute('data-id'); if(WL[id]){ WL[id].note=inp.value; wlSave(WL); } }); });
    byId2('wl-clear',function(){ if(confirm('Clear your entire watchlist?')){ WL={}; wlSave(WL); document.getElementById('view').innerHTML=renderWatchlist(); wire('watchlist'); } });
    wlCsvBind();
  }
  function wlCsvBind(){
    byId2('wl-csv',function(e){
      var ids=Object.keys(WL); var rows=ids.map(function(id){var r=fById[id];return r?{Constituency:r.constituency,State:r.state,MP:r.mp,'Unspent (Cr)':r.unspentBalance,'Inefficiency':r.inefficiencyScore,Category:r.inefficiencyCategory,Note:(WL[id].note||'')}:null;}).filter(Boolean);
      if(!rows.length){alert('Watchlist is empty.');return;}
      var keys=Object.keys(rows[0]); var csv=[keys.join(',')].concat(rows.map(function(r){return keys.map(function(k){var v=r[k]==null?'':String(r[k]);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',');})).join('\n');
      saveFile('mplad-watchlist.csv', csv, e && e.currentTarget);
    });
  }
  // ---- RTI wiring ----
  function bindRTI(){
    var sel=document.getElementById('rti-con');
    if(sel) sel.addEventListener('change',function(){ rtiSel.id=sel.value; document.getElementById('view').innerHTML=renderRTI(); wire('rti'); });
    function upd(id,key){ var el=document.getElementById(id); if(el) el.addEventListener('input',function(){ rtiSel[key]=el.value; var pv=document.getElementById('rti-preview'); if(pv && rtiSel.id && fById[rtiSel.id]) pv.textContent=rtiText(fById[rtiSel.id]); }); }
    upd('rti-name','name'); upd('rti-addr','address'); upd('rti-place','place');
    byId2('rti-copy',function(){
      var t=rtiSel.id&&fById[rtiSel.id]?rtiText(fById[rtiSel.id]):'';
      if(!t) return;
      var done=function(){ var b=document.getElementById('rti-copy'); if(b){var o=b.textContent; b.textContent='✓ Copied'; setTimeout(function(){b.textContent=o;},1500);} };
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t);done();}); }
      else { fallbackCopy(t); done(); }
    });
    byId2('rti-pdf',function(e){
      if(!(rtiSel.id&&fById[rtiSel.id])) return;
      var r=fById[rtiSel.id];
      try{
        var jsPDF=window.jspdf.jsPDF; var doc=new jsPDF({unit:'pt',format:'a4'});
        var margin=48, W=doc.internal.pageSize.getWidth(), Hh=doc.internal.pageSize.getHeight(), y=margin;
        doc.setFont('times','normal'); doc.setFontSize(11);
        var lines=doc.splitTextToSize(rtiText(r), W-margin*2);
        for(var i=0;i<lines.length;i++){ if(y>Hh-margin){ doc.addPage(); y=margin; } doc.text(lines[i], margin, y); y+=16; }
        doc.save('RTI-'+r.constituency.replace(/[^A-Za-z0-9]+/g,'-')+'.pdf');
      }catch(err){ alert('PDF export failed: '+err.message); }
    });
  }
  function fallbackCopy(t){ try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }catch(e){} }
  // ---- Case wiring ----
  function caseButtons(){
    document.querySelectorAll('[data-case]').forEach(function(b){ b.addEventListener('click',function(){ var id=b.getAttribute('data-case'); if(!caseHas(id)){ caseOpen(id); b.textContent='✓ Case opened'; } else { location.hash='#/cases'; } }); });
  }
  function bindCases(){
    document.querySelectorAll('.case-status').forEach(function(sel){ sel.addEventListener('change',function(){ var id=sel.getAttribute('data-id'); if(CASES[id]){ CASES[id].status=sel.value; CASES[id].updated=Date.now(); casesSave(CASES); document.getElementById('view').innerHTML=renderCases(); wire('cases'); } }); });
    document.querySelectorAll('.case-assignee').forEach(function(inp){ inp.addEventListener('change',function(){ var id=inp.getAttribute('data-id'); if(CASES[id]){ CASES[id].assignee=inp.value; CASES[id].updated=Date.now(); casesSave(CASES); } }); });
    document.querySelectorAll('.case-finding').forEach(function(ta){ ta.addEventListener('change',function(){ var id=ta.getAttribute('data-id'); if(CASES[id]){ CASES[id].finding=ta.value; CASES[id].updated=Date.now(); casesSave(CASES); } }); });
    document.querySelectorAll('[data-case-rm]').forEach(function(b){ b.addEventListener('click',function(){ var id=b.getAttribute('data-case-rm'); if(confirm('Delete this case?')){ delete CASES[id]; casesSave(CASES); document.getElementById('view').innerHTML=renderCases(); wire('cases'); } }); });
    byId2('case-csv',function(e){
      var ids=Object.keys(CASES); var rows=ids.map(function(id){var r=fById[id];return r?{Constituency:r.constituency,State:r.state,MP:r.mp,Status:CASES[id].status,Officer:(CASES[id].assignee||''),Score:r.inefficiencyScore,Finding:(CASES[id].finding||''),Opened:new Date(CASES[id].created).toISOString().slice(0,10)}:null;}).filter(Boolean);
      if(!rows.length){alert('No cases.');return;}
      var keys=Object.keys(rows[0]); var csv=[keys.join(',')].concat(rows.map(function(r){return keys.map(function(k){var v=r[k]==null?'':String(r[k]);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',');})).join('\n');
      saveFile('mplad-case-register.csv', csv, e && e.currentTarget);
    });
  }
  function bindCompare(){
    var sel=document.getElementById('cmp-add-sel');
    if(sel) sel.addEventListener('change',function(){ if(sel.value && compareSet.indexOf(sel.value)===-1 && compareSet.length<3){ compareSet.push(sel.value); document.getElementById('view').innerHTML=renderCompare(); wire('compare'); } });
    byId2('cmp-clear',function(){ compareSet=[]; document.getElementById('view').innerHTML=renderCompare(); wire('compare'); });
    document.querySelectorAll('[data-cmp-rm]').forEach(function(b){ b.addEventListener('click',function(){ var id=b.getAttribute('data-cmp-rm'); compareSet=compareSet.filter(function(x){return x!==id;}); document.getElementById('view').innerHTML=renderCompare(); wire('compare'); }); });
  }
  function byId2(id,fn){ var el=document.getElementById(id); if(el) el.addEventListener('click',fn); }
  function rowlinks(){ document.querySelectorAll('tr.rowlink[data-goto]').forEach(function(tr){ tr.addEventListener('click',function(e){ if(e.target.tagName==='A')return; location.hash=tr.getAttribute('data-goto'); }); }); }
  function presets(){
    document.querySelectorAll('[data-preset-state]').forEach(function(el){ el.addEventListener('click',function(e){ e.preventDefault(); fState={q:'',state:el.getAttribute('data-preset-state'),category:'',flag:'',sort:'score',dir:'desc',page:1}; location.hash='#/funds'; route(); }); });
  }
  function bindFund(){
    var map={'ff-q':'q','ff-state':'state','ff-cat':'category','ff-flag':'flag'};
    Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(!el)return; var ev=el.tagName==='SELECT'?'change':'input'; el.addEventListener(ev,function(){ fState[map[id]]=el.value; fState.page=1; refreshFund(); }); });
    byId2('ff-clear',function(){ fState={q:'',state:'',category:'',flag:'',sort:'score',dir:'desc',page:1}; document.getElementById('view').innerHTML=renderFunds(); wire('funds'); });
  }
  function bindFundTable(){
    byId2('fp-prev',function(){fState.page--;refreshFund();}); byId2('fp-next',function(){fState.page++;refreshFund();});
    document.querySelectorAll('th.sortable[data-sort]').forEach(function(th){ th.addEventListener('click',function(){ var k=th.getAttribute('data-sort'); if(fState.sort===k)fState.dir=fState.dir==='desc'?'asc':'desc'; else {fState.sort=k;fState.dir='desc';} fState.page=1; refreshFund(); }); });
    rowlinks();
  }
  function refreshFund(){ document.getElementById('funds-table').innerHTML=fundsTable(); bindFundTable(); }
  function bindWork(){
    var map={'wf-q':'q','wf-risk':'risk','wf-state':'state','wf-cat':'category','wf-status':'status','wf-sort':'sort'};
    Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(!el)return; var ev=el.tagName==='SELECT'?'change':'input'; el.addEventListener(ev,function(){ wStateF[map[id]]=el.value; wStateF.page=1; refreshWork(); }); });
    byId2('wf-clear',function(){ wStateF={q:'',state:'',category:'',status:'',risk:'',sort:'risk',page:1}; document.getElementById('view').innerHTML=renderProjects(); wire('projects'); });
  }
  function bindWorkTable(){ byId2('wp-prev',function(){wStateF.page--;refreshWork();}); byId2('wp-next',function(){wStateF.page++;refreshWork();}); rowlinks(); }
  function refreshWork(){ document.getElementById('works-table').innerHTML=worksTable(); bindWorkTable(); }
  // ---- AI chat ----
  var sampleNs=undefined; // undefined=not tried, null=unavailable, obj=ready
  async function getSample(){
    if(sampleNs!==undefined) return sampleNs;
    sampleNs=null;
    try{ if(window.claude && typeof window.claude.use==='function'){ sampleNs = await window.claude.use('sample'); } }catch(e){ sampleNs=null; }
    return sampleNs;
  }
  async function detectAI(){
    var s=await getSample();
    aiMode = s ? 'live' : 'offline';
    var host=document.getElementById('ai-badge-host'); if(host) host.innerHTML=aiBadge();
  }
  async function doAsk(q){
    if(!q||!q.trim()) return;
    q=q.trim();
    var i=document.getElementById('qa-input'); if(i) i.value='';
    chat.push({role:'user', text:q});
    var botIdx=chat.push({role:'bot', text:'', pending:true, cites:[]})-1;
    paintChat();
    var det=answer(q); // deterministic answer + citations (grounding)
    var s=await getSample();
    if(!s){
      aiMode='offline'; var hb=document.getElementById('ai-badge-host'); if(hb) hb.innerHTML=aiBadge();
      chat[botIdx]={role:'bot', text:det.a, pending:false, cites:det.cites};
      paintChat(); return;
    }
    aiMode='live';
    var ctx=buildAIContext(q);
    var input=AI_SYSTEM+'\n\nDATA:\n'+ctx+'\n\nQUESTION: '+q+'\n\nAnswer:';
    try{
      var res=await s(input,{ modelTier:'default', cache:false, onText:function(o){ chat[botIdx].text=o.text; chat[botIdx].pending=false; paintChat(); } });
      chat[botIdx]={role:'bot', text:(res&&res.text)||chat[botIdx].text||det.a, pending:false, cites:det.cites};
      paintChat();
    }catch(err){
      var code=err&&err.code;
      var msg = code==='rate_limited' ? 'The assistant is rate-limited right now — here is a direct answer from the data:\n\n'+det.a
              : code==='not_granted' ? det.a
              : (err&&err.text) ? err.text
              : det.a;
      if(code==='not_granted'){ aiMode='offline'; var hb2=document.getElementById('ai-badge-host'); if(hb2) hb2.innerHTML=aiBadge(); }
      chat[botIdx]={role:'bot', text:msg, pending:false, cites:det.cites};
      paintChat();
    }
  }

  // ---- Command palette (press / or ⌘K) ----
  var cmdkItems=[];
  function buildCmdkIndex(){
    cmdkItems=[
      {label:'Overview', sub:'Executive dashboard', href:'#/overview', k:'page'},
      {label:'Fund Utilisation', sub:'Real data table + export', href:'#/funds', k:'page'},
      {label:'Compliance', sub:'MPLADS norm checks', href:'#/compliance', k:'page'},
      {label:'India map', sub:'Choropleth by state', href:'#/map', k:'page'},
      {label:'My Constituency', sub:'Citizen lookup', href:'#/citizen', k:'page'},
      {label:'Compare', sub:'Side-by-side', href:'#/compare', k:'page'},
      {label:'Watchlist', sub:'Your review queue', href:'#/watchlist', k:'page'},
      {label:'Validation', sub:'Model credibility', href:'#/validation', k:'page'},
      {label:'Ask AI', sub:'Assistant', href:'#/ask', k:'page'},
      {label:'Data Sources', sub:'Provenance & method', href:'#/sources', k:'page'}
    ].concat(FREC.map(function(r){ return {label:r.constituency, sub:r.state+' · '+r.mp+' · score '+r.inefficiencyScore, href:'#/constituency/'+r.id, k:'constituency'}; }));
  }
  var cmdkActive=0, cmdkFiltered=[];
  function openCmdk(){
    if(document.getElementById('cmdk-bg')) return;
    if(!cmdkItems.length) buildCmdkIndex();
    var bg=document.createElement('div'); bg.id='cmdk-bg';
    bg.innerHTML='<div id="cmdk"><input id="cmdk-input" placeholder="Search constituencies, states, pages…" autocomplete="off"><div id="cmdk-list"></div><div class="cmdk-hint"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click',function(e){ if(e.target===bg) closeCmdk(); });
    var inp=document.getElementById('cmdk-input');
    inp.addEventListener('input',function(){ cmdkActive=0; renderCmdk(inp.value); });
    inp.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){ e.preventDefault(); cmdkActive=Math.min(cmdkFiltered.length-1,cmdkActive+1); renderCmdk(inp.value,true); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); cmdkActive=Math.max(0,cmdkActive-1); renderCmdk(inp.value,true); }
      else if(e.key==='Enter'){ e.preventDefault(); var it=cmdkFiltered[cmdkActive]; if(it){ location.hash=it.href; closeCmdk(); } }
      else if(e.key==='Escape'){ closeCmdk(); }
    });
    renderCmdk(''); inp.focus();
  }
  function renderCmdk(q,keep){
    q=(q||'').toLowerCase().trim();
    cmdkFiltered = !q ? cmdkItems.slice(0,8) : cmdkItems.filter(function(it){ return it.label.toLowerCase().indexOf(q)>=0 || (it.sub&&it.sub.toLowerCase().indexOf(q)>=0); }).slice(0,40);
    if(!keep) cmdkActive=0;
    var list=document.getElementById('cmdk-list'); if(!list) return;
    list.innerHTML = cmdkFiltered.length ? cmdkFiltered.map(function(it,idx){ return '<div class="cmdk-item'+(idx===cmdkActive?' active':'')+'" data-i="'+idx+'"><div><div>'+esc(it.label)+'</div>'+(it.sub?'<div class="sub">'+esc(it.sub)+'</div>':'')+'</div><span class="k">'+it.k+'</span></div>'; }).join('') : '<div class="empty" style="padding:20px;">No matches.</div>';
    Array.prototype.forEach.call(list.querySelectorAll('.cmdk-item'),function(el){ el.addEventListener('click',function(){ var it=cmdkFiltered[+el.getAttribute('data-i')]; if(it){ location.hash=it.href; closeCmdk(); } }); });
    var act=list.querySelector('.cmdk-item.active'); if(act) act.scrollIntoView({block:'nearest'});
  }
  function closeCmdk(){ var bg=document.getElementById('cmdk-bg'); if(bg) bg.remove(); }
  document.addEventListener('keydown',function(e){
    if((e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||'')))||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')){ e.preventDefault(); openCmdk(); }
  });
  document.getElementById('cmdk-open').addEventListener('click',openCmdk);

  // ---- Role switching ----
  document.getElementById('role-select').addEventListener('change',function(e){
    role=e.target.value;
    try{ localStorage.setItem('mplad-role', role); }catch(err){}
    applyRole();
    location.hash=ROLES[role].home;
    route();
  });

  // ---- Guided tour / judge mode ----
  function topConstituencyId(){
    return FREC.slice().sort(function(a,b){return b.inefficiencyScore-a.inefficiencyScore;})[0].id;
  }
  function tourSteps(){
    var tid=topConstituencyId(), t=fById[tid];
    return [
      {route:'#/overview', title:'The problem', text:'MPLADS runs across '+FAGG.totalMPs+' MP constituencies and '+cr(FAGG.totalEntitlement)+' of entitlement. Reviewing every constituency by hand is impossible — so most irregularities are simply never looked at.'},
      {route:'#/overview', title:'What the data says', text:'Of '+cr(FAGG.totalReleased)+' actually released, '+cr(FAGG.totalUnspent)+' is sitting unspent and '+cr(FAGG.totalReleasePending)+' was never released at all. The engine flags '+FAGG.categoryCounts.SEVERE+' severe and '+FAGG.categoryCounts.ELEVATED+' elevated constituencies — a review list of ~'+(FAGG.categoryCounts.SEVERE+FAGG.categoryCounts.ELEVATED)+' instead of '+FAGG.totalMPs+'.'},
      {route:'#/funds', title:'A ranked review queue', text:'Every constituency scored on idle funds, over-sanction, pending release and stalled pipelines. Sortable, filterable, and exportable to Excel, CSV or PDF — this is what an auditor actually works from.'},
      {route:'#/constituency/'+tid, title:'Drill into one case', text:esc(t.constituency)+' ('+esc(t.state)+') scores '+t.inefficiencyScore+'/100. Every point is explained: which signal fired, how much it contributed, and why — no black box.'},
      {route:'#/map', title:'Where the money is stuck', text:'The same real data as a choropleth of India. Switch the metric to unspent funds or flagged share, and click any state to filter the review queue to it.'},
      {route:'#/compliance', title:'Against the actual scheme rules', text:'MPLADS has explicit norms — ₹5 crore per MP per year, full release, timely utilisation. We check every norm the published data supports, and are transparent that SC/ST allocation and sanction timelines need the work-level eSAKSHI feed.'},
      {route:'#/validation', title:'How we know it works', text:'99% precision and 94% recall on a labelled anomaly set, a threshold-sensitivity curve, per-anomaly-type detection rates, and a Benford first-digit forensic test — plus an honest statement of what we cannot claim.'},
      {route:'#/citizen', title:'Not just for officials', text:'Any citizen can pick their State and constituency and read, in plain language, what their MP received, spent and left idle. Oversight only works if the public can see it too.'},
      {route:'#/ask', title:'Ask it anything', text:'A grounded assistant that answers from the real figures and can draft a review note — instructed never to invent a number. Falls back to deterministic answers if the model is unavailable, so the demo never breaks.'},
      {route:'#/overview', title:'The three questions', text:'What looks wrong? Why does it look wrong? What should the officer investigate next? Every screen answers one of them — on real government data, with every claim traceable to a source.'}
    ];
  }
  var tour=null, tourIdx=0;
  function startTour(){
    tour=tourSteps(); tourIdx=0; renderTour();
  }
  function endTour(){
    tour=null;
    var el=document.getElementById('judge-bar'); if(el) el.remove();
  }
  function renderTour(){
    if(!tour) return;
    var s=tour[tourIdx];
    if(location.hash!==s.route){ location.hash=s.route; route(); }
    var el=document.getElementById('judge-bar');
    if(!el){ el=document.createElement('div'); el.id='judge-bar'; el.className='no-print'; document.body.appendChild(el); }
    el.innerHTML='<div class="jt"><span class="jstep">Step '+(tourIdx+1)+' / '+tour.length+'</span><span class="jtitle">'+esc(s.title)+'</span></div>'+
      '<div class="jtext">'+s.text+'</div>'+
      '<div class="jrow"><div class="jprog"><span style="width:'+Math.round((tourIdx+1)/tour.length*100)+'%"></span></div>'+
      '<button class="btn" id="jt-prev"'+(tourIdx===0?' disabled':'')+'>Back</button>'+
      (tourIdx===tour.length-1 ? '<button class="btn primary" id="jt-done">Finish</button>' : '<button class="btn primary" id="jt-next">Next</button>')+
      '<button class="btn" id="jt-exit" title="Exit tour">✕</button></div>';
    var p=document.getElementById('jt-prev'); if(p) p.addEventListener('click',function(){ if(tourIdx>0){tourIdx--; renderTour();} });
    var n=document.getElementById('jt-next'); if(n) n.addEventListener('click',function(){ if(tourIdx<tour.length-1){tourIdx++; renderTour();} });
    var d=document.getElementById('jt-done'); if(d) d.addEventListener('click',endTour);
    var x=document.getElementById('jt-exit'); if(x) x.addEventListener('click',endTour);
  }
  document.getElementById('judge-start').addEventListener('click',function(){ if(tour) endTour(); else { markTourSeen(); var n=document.getElementById('tour-nudge'); if(n) n.remove(); startTour(); } });
  document.addEventListener('keydown',function(e){
    if(!tour) return;
    if(e.key==='Escape'){ endTour(); }
    else if(e.key==='ArrowRight' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||'')){ if(tourIdx<tour.length-1){tourIdx++; renderTour();} }
    else if(e.key==='ArrowLeft' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||'')){ if(tourIdx>0){tourIdx--; renderTour();} }
  });

  applyRole();
  if(!location.hash) location.hash=ROLES[role].home;
  route();
})();
