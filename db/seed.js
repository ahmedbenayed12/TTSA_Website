require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@ttsa.tn';
  const password = process.env.ADMIN_PASSWORD || 'Admin@2026!';
  const hash = await bcrypt.hash(password, 12);

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (!existing) {
    db.prepare(
      "INSERT INTO admins(email, password_hash, first_name, last_name) VALUES(?,?,?,?)"
    ).run(email, hash, 'Super', 'Admin');
    console.log(`✅ Super Admin seeded: ${email}`);
  } else {
    console.log(`ℹ️  Super Admin already exists: ${email}`);
  }
}

seed().catch(console.error);
