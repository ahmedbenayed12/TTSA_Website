const db = require('better-sqlite3')('./ttsa.db');
const cols = db.prepare('PRAGMA table_info(abstracts)').all();
console.log('Columns:', cols.map(c => c.name).join(', '));

// Also check drafts
const drafts = db.prepare("SELECT id, status, submission_number, is_locked FROM abstracts WHERE status='Draft'").all();
console.log('Draft abstracts:', JSON.stringify(drafts, null, 2));

// Check deadline
const deadline = db.prepare("SELECT value FROM settings WHERE key='submission_deadline'").get();
console.log('Deadline setting:', deadline);
console.log('Current time:', new Date().toISOString());
console.log('Deadline passed?', deadline ? new Date() > new Date(deadline.value) : 'no deadline');
