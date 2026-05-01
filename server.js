require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
