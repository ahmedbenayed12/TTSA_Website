require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { requireAdmin } = require('./middleware/auth');

const app = express();

// ─── Security Headers (helmet) ────────────────────────────────────────────────
app.use(helmet({
  // Allow inline scripts/styles needed by admin SPA pages and certification editor
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "blob:"],
      objectSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for file downloads
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.APP_URL,
  'https://ttsa.tn',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Certification API Proxy (Super Admin Only) ──────────────────────────────
// Must be registered BEFORE express.json() to allow clean multipart/streaming proxying
app.use('/api/cert', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  return requireAdmin(req, res, next);
}, createProxyMiddleware({
  target: 'http://127.0.0.1:8000',
  pathRewrite: (path) => (path.startsWith('/api') ? path : '/api' + path),
  changeOrigin: true,
  ws: true,
  on: {
    error: (err, req, res) => {
      console.error('Certification service proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Certification backend is starting or unavailable. Please retry in a few seconds.',
          details: err.message,
        });
      }
    },
  },
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Certification Manager Frontend (Super Admin Only) ───────────────────────
const certDistDir = path.join(__dirname, 'certification', 'frontend', 'dist');

function requireAdminPageOrToken(req, res, next) {
  // Allow static assets under /admin/certification/assets/ without query token
  if (req.path.startsWith('/assets/')) {
    return next();
  }

  let token = req.query.token;
  const authHeader = req.headers['authorization'];
  if (!token && authHeader) token = authHeader.split(' ')[1];

  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>403 Forbidden</title></head>
        <body style="font-family:sans-serif;padding:60px 20px;text-align:center;background:#f8fafc;color:#1e293b">
          <h1 style="color:#e11d48;font-size:2rem;margin-bottom:12px">403 Forbidden</h1>
          <p style="font-size:1.1rem;margin-bottom:24px">Access to Certification Manager is strictly restricted to Super Admin.</p>
          <a href="/login.html" style="background:#0C589A;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Sign in as Super Admin</a>
        </body>
        </html>
      `);
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (req.accepts('html')) {
      return res.redirect('/login.html?error=expired&redirect=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Always register the certification route — show helpful error if dist is missing
app.use('/admin/certification', requireAdminPageOrToken, (req, res, next) => {
  if (fs.existsSync(certDistDir)) return next();
  // dist not built yet — show a clear error instead of a blank loop
  return res.status(503).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>Certification Manager – Building…</title></head>
    <body style="font-family:sans-serif;padding:60px 20px;text-align:center;background:#f8fafc;color:#1e293b">
      <h1 style="color:#0C589A;font-size:2rem;margin-bottom:12px">🎓 Certification Manager</h1>
      <p style="font-size:1.1rem;margin-bottom:8px">The frontend bundle has not been built yet on this server.</p>
      <p style="font-size:.95rem;color:#64748b;margin-bottom:24px">
        Run <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">cd certification/frontend &amp;&amp; npm run build</code>
        in the project root, then restart the server.
      </p>
      <a href="/admin/dashboard.html" style="background:#0C589A;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">← Back to Dashboard</a>
    </body>
    </html>
  `);
});
app.use('/admin/certification', requireAdminPageOrToken, express.static(certDistDir));
app.use('/admin/certification', requireAdminPageOrToken, (req, res) => {
  res.sendFile(path.join(certDistDir, 'index.html'));
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads from persistent disk on Render, fallback to local path locally
const uploadsDir = process.env.RENDER === 'true' ? '/data/uploads' : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/abstracts', require('./routes/abstracts'));
app.use('/api/reviews',   require('./routes/reviews'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api',           require('./routes/public'));

// ─── Diagnostic endpoint (admin token required) ───────────────────────────────
app.get('/api/diag/cert', (req, res) => {
  let token = req.query.token;
  const authHeader = req.headers['authorization'];
  if (!token && authHeader) token = authHeader.split(' ')[1];
  let decoded = null;
  try { decoded = token ? jwt.verify(token, process.env.JWT_SECRET) : null; } catch (_) {}
  if (!decoded || decoded.role !== 'admin') {
    return res.status(403).json({ error: 'Admin token required' });
  }

  let pythonInfo = {};
  const { execSync } = require('child_process');
  try {
    pythonInfo.pythonVersion = execSync('python3 --version 2>&1').toString().trim();
  } catch (e) {
    pythonInfo.pythonVersion = e.message;
  }
  try {
    pythonInfo.pipVersion = execSync('pip3 --version 2>&1 || pip --version 2>&1').toString().trim();
  } catch (e) {
    pythonInfo.pipVersion = e.message;
  }
  try {
    pythonInfo.uvicornCheck = execSync('python3 -m uvicorn --version 2>&1').toString().trim();
  } catch (e) {
    pythonInfo.uvicornCheck = e.message;
  }
  try {
    const venvPy = path.join(__dirname, 'certification', 'backend', 'venv', 'bin', 'python');
    pythonInfo.venvExists = fs.existsSync(venvPy);
  } catch (_) {}

  res.json({
    platform: process.platform,
    node: process.version,
    cwd: process.cwd(),
    dirname: __dirname,
    certDistDir,
    certDistExists: fs.existsSync(certDistDir),
    certDistIndexExists: fs.existsSync(path.join(certDistDir, 'index.html')),
    certBackendDir: path.join(__dirname, 'certification', 'backend'),
    certBackendExists: fs.existsSync(path.join(__dirname, 'certification', 'backend')),
    pythonInfo,
    lastBackendError: certBackendLastError,
    env: { NODE_ENV: process.env.NODE_ENV, RENDER: process.env.RENDER, PORT: process.env.PORT },
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
// Serve index.html for any non-API, non-certification GET request
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/admin/certification')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Route not found' });
  } else {
    next();
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(500).json({ error: message });
});

// ─── Certification Backend Lifecycle Management ──────────────────────────────
let certBackendProcess = null;
let certBackendLastError = null;

function checkCertBackendAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureCertBackendRunning() {
  const isAlive = await checkCertBackendAlive();
  if (isAlive) {
    console.log('🎓 Certification service detected running on http://127.0.0.1:8000');
    return;
  }

  const certBackendDir = path.join(__dirname, 'certification', 'backend');
  if (!fs.existsSync(certBackendDir)) {
    console.warn('⚠️  Certification backend directory not found at', certBackendDir);
    certBackendLastError = 'Directory not found: ' + certBackendDir;
    return;
  }

  const isWindows = process.platform === 'win32';
  const venvPy = path.join(certBackendDir, 'venv', 'bin', 'python');
  const defaultPyPath = isWindows
    ? 'C:\\Users\\ABC\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
    : (fs.existsSync(venvPy) ? venvPy : (process.env.PYTHON3_PATH || 'python3'));
  const pyPath = process.env.PYTHON_PATH || defaultPyPath;

  console.log(`🚀 Spawning Certification service (${pyPath}) on port 8000...`);
  try {
    certBackendProcess = spawn(pyPath, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: certBackendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    certBackendProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('Uvicorn running') || msg.includes('Application startup complete')) {
        console.log(`🎓 [Certification API] ${msg}`);
      }
    });

    certBackendProcess.stderr.on('data', (d) => {
      const errText = d.toString().trim();
      console.warn(`🎓 [Certification API stderr] ${errText}`);
      certBackendLastError = errText;
    });

    certBackendProcess.on('exit', (code, signal) => {
      console.warn(`⚠️  Certification backend exited with code ${code}, signal ${signal}`);
      if (code !== 0 && !certBackendLastError) {
        certBackendLastError = `Exited with code ${code}`;
      }
    });

    certBackendProcess.on('error', (err) => {
      console.warn('⚠️  Could not spawn certification backend:', err.message);
      certBackendLastError = err.message;
    });
  } catch (err) {
    console.warn('⚠️  Failed to launch certification backend:', err.message);
    certBackendLastError = err.message;
  }
}

// Clean up child process on exit
const cleanUpChildProcess = () => {
  if (certBackendProcess) {
    try {
      certBackendProcess.kill();
    } catch (_) {}
  }
};
process.on('exit', cleanUpChildProcess);
process.on('SIGINT', () => { cleanUpChildProcess(); process.exit(); });
process.on('SIGTERM', () => { cleanUpChildProcess(); process.exit(); });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🏥 TTSA Platform running at http://localhost:${PORT}`);
  console.log(`📋 Admin panel: http://localhost:${PORT}/admin/dashboard.html`);
  console.log(`🎓 Certification Manager: http://localhost:${PORT}/admin/certification/`);
  console.log(`👤 Member portal: http://localhost:${PORT}/member/dashboard.html\n`);

  await ensureCertBackendRunning();
});
