# MPLAD Intelligence — separated source files

## Structure

- index.html — page markup and external library references
- css/styles.css — all CSS extracted from the original HTML
- js/app.js — application logic extracted from the original HTML
- data/appdata.json — embedded application dataset extracted from the original HTML

## Run locally

Do NOT open index.html directly with file:// because app.js loads appdata.json with fetch().

From this folder run:

```bash
python3 -m http.server 8000
```

Then open:

http://localhost:8000/

The project keeps the original functionality and data, but separates HTML, CSS, JavaScript, and data into different files.
