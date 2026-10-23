/**
 * Generator script for TTSA Official Congress Program PDFs
 * Compiles public/pdf-template/booklet-fr.html and booklet-en.html into
 * public/pdf/TTSA_Programme_Scientifique_2026_FR.pdf and
 * public/pdf/TTSA_Scientific_Program_2026_EN.pdf
 *
 * Page 0 is replaced losslessly with public/pdf/p0-A5.pdf to preserve its vector data without modification.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browserExe = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const outDir = path.join(__dirname, '..', 'public', 'pdf');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const coverPdfPath = path.join(outDir, 'p0-A5.pdf');

// Configurable version suffix: update here on every scientific program revision
const PDF_VERSION = 'v2.3';

const targets = [
  {
    template: 'http://localhost:3000/pdf-template/booklet-fr.html',
    baseName: 'TTSA_Programme_Scientifique_2026_FR.pdf',
    versionedName: `TTSA_Programme_Scientifique_2026_FR_${PDF_VERSION}.pdf`,
    lang: 'FR'
  },
  {
    template: 'http://localhost:3000/pdf-template/booklet-en.html',
    baseName: 'TTSA_Scientific_Program_2026_EN.pdf',
    versionedName: `TTSA_Scientific_Program_2026_EN_${PDF_VERSION}.pdf`,
    lang: 'EN'
  }
];

async function generateAll() {
  console.log(`Generating Official Congress Program PDFs (${PDF_VERSION})...`);

  for (const target of targets) {
    const { template, baseName, versionedName, lang } = target;
    const versionedOut = path.join(outDir, versionedName);
    const baseOut = path.join(outDir, baseName);
    const rawOut = path.join(outDir, `${versionedName}.tmp.pdf`);

    const cmd = `"${browserExe}" --headless --disable-gpu --user-data-dir="%TEMP%\\chrome-temp" --no-pdf-header-footer --print-to-pdf="${rawOut}" "${template}"`;
    console.log(`Rendering [${lang}] -> ${versionedName}`);
    try {
      execSync(cmd, { stdio: 'inherit' });

      if (fs.existsSync(coverPdfPath)) {
        console.log(`  Applying vector cover (p0-A5.pdf) as Page 0 for [${lang}]...`);
        const coverBytes = fs.readFileSync(coverPdfPath);
        const coverDoc = await PDFDocument.load(coverBytes);

        const rawBytes = fs.readFileSync(rawOut);
        const rawDoc = await PDFDocument.load(rawBytes);

        const finalDoc = await PDFDocument.create();

        // 1. Exact vector page 0 from p0-A5.pdf
        const [coverPage] = await finalDoc.copyPages(coverDoc, [0]);
        finalDoc.addPage(coverPage);

        // 2. Exact pages 1..end from rawDoc
        const pageIndices = Array.from({ length: rawDoc.getPageCount() - 1 }, (_, i) => i + 1);
        const mainPages = await finalDoc.copyPages(rawDoc, pageIndices);
        mainPages.forEach(p => finalDoc.addPage(p));

        const finalBytes = await finalDoc.save();
        fs.writeFileSync(versionedOut, finalBytes);
        fs.writeFileSync(baseOut, finalBytes);
        try { fs.unlinkSync(rawOut); } catch (e) {}

        const size = (fs.statSync(versionedOut).size / 1024).toFixed(0);
        console.log(`✓ [${lang}] Generated successfully: ${versionedName} (${size} KB, ${finalDoc.getPageCount()} pages)`);
      } else {
        fs.copyFileSync(rawOut, versionedOut);
        fs.renameSync(rawOut, baseOut);
        const size = (fs.statSync(versionedOut).size / 1024).toFixed(0);
        console.log(`✓ [${lang}] Generated successfully: ${versionedName} (${size} KB)`);
      }
    } catch (err) {
      console.error(`✗ Error generating [${lang}]:`, err.message);
    }
  }

  console.log('Done.');
}

generateAll().catch(err => {
  console.error('Fatal error in PDF generation:', err);
  process.exit(1);
});
