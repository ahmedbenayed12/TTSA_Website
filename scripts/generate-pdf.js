/**
 * Generator script for TTSA Official Congress Program PDFs
 * Compiles public/pdf-template/booklet-fr.html and booklet-en.html into
 * public/pdf/TTSA_Programme_Scientifique_2026_FR.pdf and
 * public/pdf/TTSA_Scientific_Program_2026_EN.pdf
 *
 * Page 0 is replaced losslessly with public/pdf/p0-A5.pdf to preserve its vector data.
 *
 * Strategy: creates a temporary patched HTML file with all root-relative asset paths
 * (/img/, /fonts/, /js/, /css/) rewritten to absolute file:// URLs so the browser
 * can load local assets without needing a running HTTP server (avoids timeout issues).
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PDFDocument } = require('pdf-lib');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browserExe = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;
const outDir = path.join(__dirname, '..', 'public', 'pdf');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const publicDir = path.join(__dirname, '..', 'public');
const templateDir = path.join(publicDir, 'pdf-template');
const coverPdfPath = path.join(outDir, 'p0-A5.pdf');

// Configurable version suffix: update here on every scientific program revision
const PDF_VERSION = 'v2.21';

// Convert an absolute Windows path to a file:// URL
function toFileUrl(absPath) {
  return 'file:///' + absPath.replace(/\\/g, '/');
}

/**
 * Rewrites all root-relative asset paths in an HTML string to absolute file:// URLs.
 * e.g. src="/img/logo.svg" -> src="file:///C:/Users/.../public/img/logo.svg"
 */
function patchAssetPaths(html, publicDirAbs) {
  const base = toFileUrl(publicDirAbs);
  // Match src="/ and href="/ and url('/ patterns
  return html
    .replace(/(src=["'])\/(?!\/)/g, `$1${base}/`)
    .replace(/(href=["'])\/(?!\/)/g, `$1${base}/`)
    .replace(/url\(['"]?\//g, `url('${base}/`);
}

async function generateAll() {
  console.log(`Generating Official Congress Program PDFs (${PDF_VERSION})...`);

  const targets = [
    {
      templateFile: path.join(templateDir, 'booklet-fr.html'),
      baseName: 'TTSA_Programme_Scientifique_2026_FR.pdf',
      versionedName: `TTSA_Programme_Scientifique_2026_FR_${PDF_VERSION}.pdf`,
      lang: 'FR'
    },
    {
      templateFile: path.join(templateDir, 'booklet-en.html'),
      baseName: 'TTSA_Scientific_Program_2026_EN.pdf',
      versionedName: `TTSA_Scientific_Program_2026_EN_${PDF_VERSION}.pdf`,
      lang: 'EN'
    }
  ];

  for (const target of targets) {
    const { templateFile, baseName, versionedName, lang } = target;
    const versionedOut = path.join(outDir, versionedName);
    const baseOut = path.join(outDir, baseName);
    const rawOut = path.join(outDir, `${versionedName}.tmp.pdf`);

    // Create a patched temp HTML with absolute file:// asset paths
    const originalHtml = fs.readFileSync(templateFile, 'utf8');
    const patchedHtml = patchAssetPaths(originalHtml, publicDir);
    const tmpHtml = path.join(os.tmpdir(), `ttsa-${lang}-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, patchedHtml, 'utf8');

    const templateUrl = toFileUrl(tmpHtml);
    const cmd = `"${browserExe}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${rawOut}" "${templateUrl}"`;
    console.log(`Rendering [${lang}] -> ${versionedName}`);
    try {
      execSync(cmd, { stdio: 'inherit', timeout: 120000 });

      // Clean up temp file
      try { fs.unlinkSync(tmpHtml); } catch (e) {}

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
      try { fs.unlinkSync(tmpHtml); } catch (e) {}
      console.error(`✗ Error generating [${lang}]:`, err.message);
    }
  }

  console.log('Done.');
}

generateAll().catch(err => {
  console.error('Fatal error in PDF generation:', err);
  process.exit(1);
});
