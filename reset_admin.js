/**
 * reset_admin.js
 * Run with: node reset_admin.js
 * Creates or resets the Super Admin account in ttsa.db
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || 'ttsa.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const email    = process.env.ADMIN_EMAIL    || 'admin@ttsa.tn';
const password = process.env.ADMIN_PASSWORD || 'Admin@2026!';

async function resetAdmin() {
  const hash = await bcrypt.hash(password, 12);

  // Ensure admins table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT 'Super',
      last_name TEXT NOT NULL DEFAULT 'Admin',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);

  if (existing) {
    // Update password of existing admin
    db.prepare('UPDATE admins SET password_hash = ? WHERE email = ?').run(hash, email);
    console.log(`✅ Admin password RESET for: ${email}`);
  } else {
    // Insert new admin
    db.prepare(
      "INSERT INTO admins(email, password_hash, first_name, last_name) VALUES(?,?,?,?)"
    ).run(email, hash, 'Super', 'Admin');
    console.log(`✅ Super Admin CREATED: ${email}`);
  }

  console.log(`\n📋 Admin Credentials:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`\n🔐 You can now log in at /admin/login`);
}

resetAdmin().catch(console.error);
