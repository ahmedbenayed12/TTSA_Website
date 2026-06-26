const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

// Relative path — works on all platforms with node-sqlite3-wasm (Windows + Linux)
// Server is always started from the app root, so 'ttsa.db' resolves correctly
const DB_PATH = process.env.DATABASE_PATH || 'ttsa.db';

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- USERS (members)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nationality TEXT NOT NULL CHECK(nationality IN ('Tunisian','Foreign')),
      country TEXT NOT NULL DEFAULT 'Tunisia',
      profession TEXT NOT NULL CHECK(profession IN ('Medical','Paramedical')),
      specialty TEXT NOT NULL CHECK(specialty IN ('Thoracic','Other')),
      specialty_details TEXT,
      seniority TEXT NOT NULL CHECK(seniority IN ('Senior','Resident')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      otp TEXT,
      otp_expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- REVIEWERS (secondary admins)
    CREATE TABLE IF NOT EXISTS reviewers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      otp TEXT,
      otp_expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ADMINS (super admins)
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT 'Super',
      last_name TEXT NOT NULL DEFAULT 'Admin',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ABSTRACTS
    CREATE TABLE IF NOT EXISTS abstracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      topic TEXT,
      main_text TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      preference TEXT NOT NULL DEFAULT 'Either' CHECK(preference IN ('Oral','Poster','Either','Video')),
      status TEXT NOT NULL DEFAULT 'Draft'
        CHECK(status IN ('Draft','Submitted','Waiting for Review','Accepted','Refused','Waiting for File Upload','Final File Uploaded')),
      is_locked INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      file_name TEXT,
      file_uploaded_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- AUTHORS (1-10 per abstract)
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abstract_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      institution TEXT NOT NULL,
      country TEXT NOT NULL,
      affiliation_index INTEGER NOT NULL,
      is_corresponding INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(abstract_id) REFERENCES abstracts(id) ON DELETE CASCADE
    );

    -- REVIEWER ASSIGNMENTS
    CREATE TABLE IF NOT EXISTS reviewer_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abstract_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(abstract_id, reviewer_id),
      FOREIGN KEY(abstract_id) REFERENCES abstracts(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
    );

    -- REVIEWS (evaluations)
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abstract_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      criteria1 INTEGER NOT NULL DEFAULT 0 CHECK(criteria1 BETWEEN 0 AND 5),
      criteria2 INTEGER NOT NULL DEFAULT 0 CHECK(criteria2 BETWEEN 0 AND 5),
      criteria3 INTEGER NOT NULL DEFAULT 0 CHECK(criteria3 BETWEEN 0 AND 5),
      criteria4 INTEGER NOT NULL DEFAULT 0 CHECK(criteria4 BETWEEN 0 AND 5),
      total_score INTEGER GENERATED ALWAYS AS (criteria1+criteria2+criteria3+criteria4) STORED,
      verdict TEXT CHECK(verdict IN ('Admitted','Refused')),
      presentation_type TEXT CHECK(presentation_type IN ('Oral Communication','Commented E-Poster','Non-Commented E-Poster','Video')),
      comments TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(abstract_id, reviewer_id),
      FOREIGN KEY(abstract_id) REFERENCES abstracts(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
    );

    -- SETTINGS (dynamic config)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- EVENTS
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT,
      event_end_date TEXT,
      location TEXT,
      poster_url TEXT,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- GUIDELINES
    CREATE TABLE IF NOT EXISTS guidelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      file_url TEXT,
      category TEXT DEFAULT 'General',
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Default settings
  const defaultSettings = [
    ['congress_name', 'TTSA Annual Congress 2026'],
    ['submission_deadline', '2026-08-31T23:59:59'],
    ['submission_start',    '2026-07-01T00:00:00'],
    ['upload_deadline', '2026-10-15T23:59:59'],
    ['blind_review', 'false'],
    ['max_abstracts_per_user', '3'],
    ['max_words_per_abstract', '300'],
    ['criteria1_label', 'Relevance'],
    ['criteria2_label', 'Methodology'],
    ['criteria3_label', 'Clarity'],
    ['criteria4_label', 'Practical Impact'],
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)'
  );
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  console.log('✅ Database schema initialized');

  // Migration: add submission_number if not present
  const cols = db.prepare("PRAGMA table_info(abstracts)").all().map(c => c.name);
  if (!cols.includes('submission_number')) {
    db.exec('ALTER TABLE abstracts ADD COLUMN submission_number INTEGER');
    console.log('✅ Migration: submission_number column added');
  }

  // Migration: update CHECK constraints for 'preference' and 'presentation_type' to include 'Video'
  const abstractsTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='abstracts'").get();
  if (abstractsTableInfo && !abstractsTableInfo.sql.includes("'Video'")) {
    console.log('🔄 Migrating abstracts table to include Video preference...');
    db.exec(`
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS abstracts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        topic TEXT,
        main_text TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        preference TEXT NOT NULL DEFAULT 'Either' CHECK(preference IN ('Oral','Poster','Either','Video')),
        status TEXT NOT NULL DEFAULT 'Draft'
          CHECK(status IN ('Draft','Submitted','Waiting for Review','Accepted','Refused','Waiting for File Upload','Final File Uploaded')),
        is_locked INTEGER NOT NULL DEFAULT 0,
        file_path TEXT,
        file_name TEXT,
        file_uploaded_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        submission_number INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO abstracts_new (id, user_id, submission_number, title, topic, main_text, word_count, preference, status, is_locked, file_path, file_name, file_uploaded_at, created_at, updated_at)
      SELECT id, user_id, submission_number, title, topic, main_text, word_count, preference, status, is_locked, file_path, file_name, file_uploaded_at, created_at, updated_at FROM abstracts;
      DROP TABLE abstracts;
      ALTER TABLE abstracts_new RENAME TO abstracts;
      COMMIT;
      PRAGMA foreign_keys=on;
    `);
    console.log('✅ Migration: abstracts table updated for Video preference');
  }

  // Migration: update presentation_type CHECK constraint to new values
  // New allowed values: 'Oral Communication', 'Commented E-Poster', 'Non-Commented Poster', 'Video'
  const reviewsTableInfo2 = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reviews'").get();
  const hasNewPresentationTypes = reviewsTableInfo2 && reviewsTableInfo2.sql.includes("'Non-Commented E-Poster'");
  if (!hasNewPresentationTypes) {
    console.log('🔄 Migrating reviews table to new presentation_type values...');
    db.exec(`
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS reviews_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        abstract_id INTEGER NOT NULL,
        reviewer_id INTEGER NOT NULL,
        criteria1 INTEGER NOT NULL DEFAULT 0 CHECK(criteria1 BETWEEN 0 AND 5),
        criteria2 INTEGER NOT NULL DEFAULT 0 CHECK(criteria2 BETWEEN 0 AND 5),
        criteria3 INTEGER NOT NULL DEFAULT 0 CHECK(criteria3 BETWEEN 0 AND 5),
        criteria4 INTEGER NOT NULL DEFAULT 0 CHECK(criteria4 BETWEEN 0 AND 5),
        total_score INTEGER GENERATED ALWAYS AS (criteria1+criteria2+criteria3+criteria4) STORED,
        verdict TEXT CHECK(verdict IN ('Admitted','Refused')),
        presentation_type TEXT CHECK(presentation_type IN ('Oral Communication','Commented E-Poster','Non-Commented E-Poster','Video')),
        comments TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(abstract_id, reviewer_id),
        FOREIGN KEY(abstract_id) REFERENCES abstracts(id) ON DELETE CASCADE,
        FOREIGN KEY(reviewer_id) REFERENCES reviewers(id) ON DELETE CASCADE
      );
      INSERT INTO reviews_new (id, abstract_id, reviewer_id, criteria1, criteria2, criteria3, criteria4, verdict, comments, created_at, updated_at)
      SELECT id, abstract_id, reviewer_id, criteria1, criteria2, criteria3, criteria4, verdict, comments, created_at, updated_at FROM reviews;
      DROP TABLE reviews;
      ALTER TABLE reviews_new RENAME TO reviews;
      COMMIT;
      PRAGMA foreign_keys=on;
    `);
    console.log('✅ Migration: reviews presentation_type updated to new values');
  }

  // Migration: add must_change_password, otp, otp_expires_at to reviewers if not present
  const reviewerCols = db.prepare("PRAGMA table_info(reviewers)").all().map(c => c.name);
  if (!reviewerCols.includes('must_change_password')) {
    db.exec('ALTER TABLE reviewers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1');
    console.log('✅ Migration: must_change_password column added to reviewers');
  }
  if (!reviewerCols.includes('otp')) {
    db.exec('ALTER TABLE reviewers ADD COLUMN otp TEXT');
    console.log('✅ Migration: otp column added to reviewers');
  }
  if (!reviewerCols.includes('otp_expires_at')) {
    db.exec('ALTER TABLE reviewers ADD COLUMN otp_expires_at INTEGER');
    console.log('✅ Migration: otp_expires_at column added to reviewers');
  }

  // Migration: add is_blocked to users table if not present
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('is_blocked')) {
    db.exec('ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0');
    console.log('✅ Migration: is_blocked column added to users');
  }
}

initSchema();

module.exports = db;
