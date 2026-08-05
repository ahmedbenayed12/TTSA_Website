/**
 * get_admin_token.js
 * Run: node get_admin_token.js
 * Generates a valid admin JWT token and prints browser console commands to log in.
 */
require('dotenv').config();
const jwt    = require('jsonwebtoken');
const Database = require('better-sqlite3');

const DB_PATH   = process.env.DATABASE_PATH || 'ttsa.db';
const JWT_SECRET = process.env.JWT_SECRET;

const db    = new Database(DB_PATH);
const admin = db.prepare('SELECT id, email, first_name FROM admins LIMIT 1').get();

if (!admin) {
  console.error('❌ No admin found in database. Run: node reset_admin.js first.');
  process.exit(1);
}

const token = jwt.sign(
  { id: admin.id, email: admin.email, role: 'admin', name: admin.first_name },
  JWT_SECRET,
  { expiresIn: '7d' }
);

console.log('\n✅ Admin token generated for:', admin.email);
console.log('\n══════════════════════════════════════════════════════════════');
console.log('STEP 1 — Open this URL in your browser:');
console.log('  http://localhost:3000/admin/dashboard.html');
console.log('\nSTEP 2 — Open browser DevTools (F12) → Console tab');
console.log('\nSTEP 3 — Paste this command and press Enter:');
console.log('──────────────────────────────────────────────────────────────');
console.log(`localStorage.setItem('token', '${token}'); localStorage.setItem('role', 'admin'); localStorage.setItem('name', '${admin.first_name}'); location.reload();`);
console.log('══════════════════════════════════════════════════════════════\n');
