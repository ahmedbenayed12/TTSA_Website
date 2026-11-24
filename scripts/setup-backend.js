/**
 * Auto-setup script for Certification Backend (FastAPI/Python) on Render & Linux production environments.
 * Runs during npm postinstall on Render.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const backendDir = path.join(__dirname, '..', 'certification', 'backend');
const reqFile = path.join(backendDir, 'requirements.txt');

console.log('📦 [setup-backend] Checking Certification backend environment...');

if (!fs.existsSync(backendDir) || !fs.existsSync(reqFile)) {
  console.log('ℹ️  [setup-backend] Backend directory or requirements.txt not found, skipping.');
  process.exit(0);
}

// On local Windows dev, python is usually already managed
if (isWindows && !process.env.RENDER) {
  console.log('ℹ️  [setup-backend] Windows local environment detected. Skipping auto pip install.');
  process.exit(0);
}

console.log('🚀 [setup-backend] Installing Python dependencies for Certification service...');

const venvDir = path.join(backendDir, 'venv');
const venvPip = path.join(venvDir, 'bin', 'pip');

let installed = false;

// Attempt 1: Using virtual environment
try {
  if (!fs.existsSync(venvPip)) {
    console.log('🔧 [setup-backend] Creating virtual environment at certification/backend/venv...');
    execSync(`python3 -m venv "${venvDir}"`, { stdio: 'inherit' });
  }

  if (fs.existsSync(venvPip)) {
    console.log('📥 [setup-backend] Installing requirements inside venv...');
    execSync(`"${venvPip}" install --upgrade pip`, { stdio: 'inherit' });
    execSync(`"${venvPip}" install -r "${reqFile}"`, { stdio: 'inherit' });
    console.log('✅ [setup-backend] Python dependencies successfully installed in venv.');
    installed = true;
  }
} catch (err) {
  console.warn('⚠️  [setup-backend] venv install failed:', err.message);
}

// Attempt 2: Fallback to direct pip3 install
if (!installed) {
  try {
    console.log('📥 [setup-backend] Attempting fallback to pip3 / pip...');
    execSync(`pip3 install -r "${reqFile}" --break-system-packages || pip3 install -r "${reqFile}" || pip install -r "${reqFile}"`, {
      stdio: 'inherit',
    });
    console.log('✅ [setup-backend] Python dependencies successfully installed via system pip.');
    installed = true;
  } catch (err) {
    console.error('❌ [setup-backend] Fallback pip install failed:', err.message);
  }
}

console.log('🎉 [setup-backend] Backend setup completed.');
