const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'gui/src/style.css');
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('/* Palette: Improved color contrast for better readability */')) {
  css = css.replace(
    'background-color: #25b6eb;',
    'background-color: #2563eb; /* Palette: Improved color contrast for better readability */'
  );
}

if (!css.includes('.custom-file-upload:active')) {
  css += `

/* Palette: Added active state for primary buttons to provide tactile interaction feedback */
.custom-file-upload:active:not(:disabled),
.download-btn:active:not(:disabled) {
  transform: scale(0.98);
  transition: transform 0.1s;
}
`;
}

fs.writeFileSync(cssPath, css);
console.log('CSS updated');
