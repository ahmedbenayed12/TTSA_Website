require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();

// ─── Security Headers (helmet) ────────────────────────────────────────────────
app.use(helmet({
  // Allow inline scripts/styles needed by the admin SPA pages
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      // Allow inline event handlers (onclick="...", onchange="...", etc.) used across all admin pages
      // helmet v8 sets script-src-attr 'none' by default which blocks these:
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for file downloads
}));

// ─── CORS — restrict to your domain in production ─────────────────────────────
const allowedOrigin = process.env.APP_URL || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads from persistent disk on Render, fallback to local path locally
const uploadsDir = process.env.DATABASE_PATH ? path.join(__dirname, 'public', 'uploads') : '/data/uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/abstracts', require('./routes/abstracts'));
app.use('/api/reviews',   require('./routes/reviews'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api',           require('./routes/public'));

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
// Serve index.html for any non-API GET request
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
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
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏥 TTSA Platform running at http://localhost:${PORT}`);
  console.log(`📋 Admin panel: http://localhost:${PORT}/admin/dashboard.html`);
  console.log(`👤 Member portal: http://localhost:${PORT}/member/dashboard.html\n`);
});
