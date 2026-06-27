const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { requireMember } = require('../middleware/auth');
const { sendAbstractConfirmation } = require('../services/email');

// Multer config for presentation files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.RENDER === 'true'
      ? '/data/uploads/abstracts'
      : path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `abstract_${req.params.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.ppt', '.pptx', '.pdf', '.key'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PPT, PPTX, PDF, or KEY files allowed'));
  },
});

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getDeadline(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? new Date(row.value) : null;
}

function isDeadlinePassed(key) {
  const deadline = getDeadline(key);
  if (!deadline) return false;
  return new Date() > deadline;
}

function isSubmissionStarted() {
  const start = getDeadline('submission_start');
  if (!start) return true;
  return new Date() >= start;
}

// GET /api/abstracts — list user's abstracts
router.get('/', requireMember, (req, res) => {
  const abstracts = db.prepare(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM authors WHERE abstract_id = a.id) AS author_count
    FROM abstracts a 
    WHERE a.user_id = ? 
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  res.json(abstracts);
});

// GET /api/abstracts/:id — get single abstract with authors
router.get('/:id', requireMember, (req, res) => {
  const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!abstract) return res.status(404).json({ error: 'Abstract not found' });

  const authors = db.prepare('SELECT * FROM authors WHERE abstract_id = ? ORDER BY sort_order').all(abstract.id);
  res.json({ ...abstract, authors });
});

// POST /api/abstracts — create new abstract
router.post('/', requireMember, (req, res) => {
  try {
    if (!isSubmissionStarted()) {
      return res.status(403).json({ error: 'Abstract submission has not started yet' });
    }
    if (isDeadlinePassed('submission_deadline')) {
      return res.status(403).json({ error: 'Submission deadline has passed' });
    }

    // Check 3-abstract limit
    const maxRow = db.prepare("SELECT value FROM settings WHERE key = 'max_abstracts_per_user'").get();
    const maxCount = maxRow ? parseInt(maxRow.value) : 3;
    const count = db.prepare('SELECT COUNT(*) as c FROM abstracts WHERE user_id = ?').get(req.user.id).c;
    if (count >= maxCount) {
      return res.status(403).json({ error: `Maximum ${maxCount} abstracts per user allowed` });
    }

    const { title, topic, main_text, preference, authors } = req.body;
    if (!title || !main_text || !topic) return res.status(400).json({ error: 'Title, topic and abstract text are required' });

    // Word count check
    const maxWordsRow = db.prepare("SELECT value FROM settings WHERE key = 'max_words_per_abstract'").get();
    const maxWords = maxWordsRow ? parseInt(maxWordsRow.value) : 300;
    const wordCount = countWords(main_text);
    if (wordCount > maxWords) {
      return res.status(400).json({ error: `Abstract exceeds ${maxWords} words (current: ${wordCount})` });
    }

    if (!authors || authors.length < 1 || authors.length > 10) {
      return res.status(400).json({ error: 'Between 1 and 10 authors required' });
    }

    const result = db.prepare(`
      INSERT INTO abstracts(user_id, title, topic, main_text, word_count, preference)
      VALUES(@user_id, @title, @topic, @main_text, @word_count, @preference)
    `).run({
      user_id: req.user.id,
      title,
      topic,
      main_text,
      word_count: wordCount,
      preference: preference || 'Either'
    });

    const abstractId = result.lastInsertRowid;

    // Insert authors
    const insertAuthor = db.prepare(`
      INSERT INTO authors(abstract_id, first_name, last_name, email, institution, country, affiliation_index, is_corresponding, sort_order)
      VALUES(?,?,?,?,?,?,?,?,?)
    `);
    authors.forEach((author, idx) => {
      insertAuthor.run(
        abstractId,
        author.first_name, author.last_name,
        author.email || '',
        author.institution, author.country,
        idx + 1,
        idx === 0 ? 1 : 0, // first author is corresponding
        idx
      );
    });

    res.status(201).json({ message: 'Abstract created', id: abstractId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create abstract' });
  }
});

// PUT /api/abstracts/:id — edit abstract
router.put('/:id', requireMember, (req, res) => {
  try {
    if (!isSubmissionStarted()) {
      return res.status(403).json({ error: 'Abstract submission has not started yet' });
    }
    if (isDeadlinePassed('submission_deadline')) {
      return res.status(403).json({ error: 'Submission deadline has passed' });
    }

    const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!abstract) return res.status(404).json({ error: 'Abstract not found' });
    if (abstract.is_locked) return res.status(403).json({ error: 'This abstract is locked and cannot be edited' });

    const { title, topic, main_text, preference, authors } = req.body;
    if (!title || !main_text || !topic) return res.status(400).json({ error: 'Title, topic and abstract text are required' });
    const maxWordsRow = db.prepare("SELECT value FROM settings WHERE key = 'max_words_per_abstract'").get();
    const maxWords = maxWordsRow ? parseInt(maxWordsRow.value) : 300;
    const wordCount = countWords(main_text);
    if (wordCount > maxWords) {
      return res.status(400).json({ error: `Abstract exceeds ${maxWords} words (current: ${wordCount})` });
    }

    if (authors && (authors.length < 1 || authors.length > 10)) {
      return res.status(400).json({ error: 'Between 1 and 10 authors required' });
    }

    db.prepare(`
      UPDATE abstracts 
      SET title = @title, topic = @topic, main_text = @main_text, 
          word_count = @word_count, preference = @preference, updated_at = unixepoch()
      WHERE id = @id
    `).run({
      title,
      topic,
      main_text,
      word_count: wordCount,
      preference: preference || abstract.preference,
      id: abstract.id
    });

    if (authors) {
      db.prepare('DELETE FROM authors WHERE abstract_id = ?').run(abstract.id);
      const insertAuthor = db.prepare(`
        INSERT INTO authors(abstract_id, first_name, last_name, email, institution, country, affiliation_index, is_corresponding, sort_order)
        VALUES(?,?,?,?,?,?,?,?,?)
      `);
      authors.forEach((author, idx) => {
        insertAuthor.run(
          abstract.id,
          author.first_name, author.last_name,
          author.email || '',
          author.institution, author.country,
          idx + 1,
          idx === 0 ? 1 : 0,
          idx
        );
      });
    }

    res.json({ message: 'Abstract updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update abstract' });
  }
});

// POST /api/abstracts/:id/confirm — lock & notify
router.post('/:id/confirm', requireMember, async (req, res) => {
  try {
    const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!abstract) return res.status(404).json({ error: 'Abstract not found' });
    if (abstract.is_locked) return res.status(400).json({ error: 'Abstract already submitted' });

    // Atomically assign the next submission number
    const nextNum = db.prepare(
      "SELECT COALESCE(MAX(submission_number), 0) + 1 AS n FROM abstracts WHERE submission_number IS NOT NULL"
    ).get().n;

    db.prepare(
      "UPDATE abstracts SET is_locked=1, status='Submitted', submission_number=@n, updated_at=unixepoch() WHERE id=@id"
    ).run({ n: nextNum, id: abstract.id });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    try {
      await sendAbstractConfirmation(user.email, user.first_name, abstract.title);
    } catch (err) {
      console.error('Confirmation email failed:', err.message);
    }

    res.json({ message: 'Abstract submitted and locked successfully', submission_number: nextNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm abstract' });
  }
});

// POST /api/abstracts/:id/upload — post-acceptance file upload (and re-upload)
router.post('/:id/upload', requireMember, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Check upload deadline
    if (isDeadlinePassed('upload_deadline')) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'File upload deadline has passed' });
    }

    const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!abstract) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Abstract not found' });
    }

    if (!['Waiting for File Upload', 'Final File Uploaded'].includes(abstract.status)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'You can only upload files for accepted abstracts.' });
    }

    // Delete old file if re-uploading
    if (abstract.file_path && fs.existsSync(abstract.file_path)) {
      try { fs.unlinkSync(abstract.file_path); } catch (e) { console.error('Failed to delete old file', e); }
    }

    db.prepare(`
      UPDATE abstracts
      SET file_path = ?, file_name = ?, file_uploaded_at = unixepoch(), status = 'Final File Uploaded', updated_at = unixepoch()
      WHERE id = ?
    `).run(req.file.path, req.file.originalname, abstract.id);

    res.json({ message: 'File uploaded successfully', filename: req.file.originalname });
  } catch (err) {
    console.error(err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to process file upload' });
  }
});


// DELETE /api/abstracts/:id — delete abstract
router.delete('/:id', requireMember, (req, res) => {
  try {
    if (!isSubmissionStarted()) {
      return res.status(403).json({ error: 'Abstract submission has not started yet' });
    }
    if (isDeadlinePassed('submission_deadline')) {
      return res.status(403).json({ error: 'Submission deadline has passed, cannot delete abstract' });
    }

    const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!abstract) return res.status(404).json({ error: 'Abstract not found' });
    if (abstract.is_locked) return res.status(403).json({ error: 'This abstract is locked and cannot be deleted' });

    // Delete authors first due to foreign key
    db.prepare('DELETE FROM authors WHERE abstract_id = ?').run(abstract.id);
    
    // Delete abstract
    db.prepare('DELETE FROM abstracts WHERE id = ?').run(abstract.id);

    // Delete associated files if any
    if (abstract.file_path && fs.existsSync(abstract.file_path)) {
      try { fs.unlinkSync(abstract.file_path); } catch(e) { console.error('Failed to delete file', e); }
    }

    res.json({ message: 'Abstract deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete abstract' });
  }
});


// GET /api/abstracts/:id/file
router.get('/:id/file', requireMember, (req, res) => {
  try {
    const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ?').get(req.params.id);
    if (!abstract) return res.status(404).json({ error: 'Abstract not found' });
    if (abstract.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (!abstract.file_path || !fs.existsSync(abstract.file_path)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(abstract.file_path, abstract.file_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

module.exports = router;
