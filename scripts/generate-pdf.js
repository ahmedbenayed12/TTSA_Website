/**
 * Generator script for TTSA Official Congress Program PDFs
 * Compiles public/pdf-template/booklet-fr.html and booklet-en.html into
 * public/pdf/TTSA_Programme_Scientifique_2026_FR.pdf and
 * public/pdf/TTSA_Scientific_Program_2026_EN.pdf
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browserExe = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const outDir = path.join(__dirname, '..', 'public', 'pdf');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const targets = [
  {
    template: 'http://localhost:3000/pdf-template/booklet-fr.html',
    out: path.join(outDir, 'TTSA_Programme_Scientifique_2026_FR.pdf'),
    lang: 'FR'
  },
  {
    template: 'http://localhost:3000/pdf-template/booklet-en.html',
    out: path.join(outDir, 'TTSA_Scientific_Program_2026_EN.pdf'),
    lang: 'EN'
  }
];

console.log('Generating Official Congress Program PDFs...');

targets.forEach(({ template, out, lang }) => {
  const cmd = `"${browserExe}" --headless --disable-gpu --user-data-dir="%TEMP%\\chrome-temp" --no-pdf-header-footer --print-to-pdf="${out}" "${template}"`;
  console.log(`Rendering [${lang}] -> ${out}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    const size = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`✓ [${lang}] Generated successfully (${size} KB)`);
  } catch (err) {
    console.error(`✗ Error generating [${lang}]:`, err.message);
  }
});

console.log('Done.');
