const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireReviewer } = require('../middleware/auth');

// GET /api/reviews/assigned — list abstracts assigned to this reviewer
router.get('/assigned', requireReviewer, (req, res) => {
  const blindRow = db.prepare("SELECT value FROM settings WHERE key = 'blind_review'").get();
  const isBlind = blindRow && blindRow.value === 'true';

  const assignments = db.prepare(`
    SELECT a.id, a.title, a.main_text, a.preference, a.word_count,
           a.status, a.created_at,
           r.id as review_id, r.verdict, r.total_score, r.criteria1, r.criteria2, r.criteria3, r.criteria4, r.presentation_type, r.comments
    FROM reviewer_assignments ra
    JOIN abstracts a ON ra.abstract_id = a.id
    LEFT JOIN reviews r ON r.abstract_id = a.id AND r.reviewer_id = ra.reviewer_id
    WHERE ra.reviewer_id = ?
    ORDER BY a.id
  `).all(req.user.id);

  if (!isBlind) {
    // Add author info
    assignments.forEach(abs => {
      abs.authors = db.prepare(
        'SELECT * FROM authors WHERE abstract_id = ? ORDER BY sort_order'
      ).all(abs.id);
    });
  } else {
    assignments.forEach(abs => { abs.authors = null; abs.blind = true; });
  }

  res.json(assignments);
});

// GET /api/reviews/abstract/:id — get single abstract for review
router.get('/abstract/:id', requireReviewer, (req, res) => {
  const assignment = db.prepare(
    'SELECT * FROM reviewer_assignments WHERE abstract_id = ? AND reviewer_id = ?'
  ).get(req.params.id, req.user.id);
  if (!assignment) return res.status(403).json({ error: 'Not assigned to this abstract' });

  const abstract = db.prepare('SELECT * FROM abstracts WHERE id = ?').get(req.params.id);
  if (!abstract) return res.status(404).json({ error: 'Abstract not found' });

  const blindRow = db.prepare("SELECT value FROM settings WHERE key = 'blind_review'").get();
  const isBlind = blindRow && blindRow.value === 'true';

  const review = db.prepare('SELECT * FROM reviews WHERE abstract_id = ? AND reviewer_id = ?').get(req.params.id, req.user.id);

  let authors = null;
  if (!isBlind) {
    authors = db.prepare('SELECT * FROM authors WHERE abstract_id = ? ORDER BY sort_order').all(abstract.id);
  }

  res.json({ ...abstract, authors, review: review || null, blind: isBlind });
});

// POST /api/reviews — submit or update evaluation
router.post('/', requireReviewer, (req, res) => {
  try {
    const { abstract_id, criteria1, criteria2, criteria3, criteria4, verdict, presentation_type, comments } = req.body;

    if (!abstract_id) return res.status(400).json({ error: 'abstract_id required' });

    const assignment = db.prepare(
      'SELECT * FROM reviewer_assignments WHERE abstract_id = ? AND reviewer_id = ?'
    ).get(abstract_id, req.user.id);
    if (!assignment) return res.status(403).json({ error: 'Not assigned to this abstract' });

    // Validate scores
    for (const score of [criteria1, criteria2, criteria3, criteria4]) {
      if (score < 0 || score > 5) return res.status(400).json({ error: 'Each criterion must be between 0 and 5' });
    }
    if (!['Admitted', 'Refused'].includes(verdict)) return res.status(400).json({ error: 'Verdict must be Admitted or Refused' });
    
    let finalPresentationType = presentation_type;
    if (verdict === 'Admitted') {
      const validTypes = ['Oral Communication', 'Commented E-Poster', 'Non-Commented E-Poster', 'Video'];
      if (!validTypes.includes(finalPresentationType)) {
        return res.status(400).json({ error: 'Presentation type must be Oral Communication, Commented E-Poster, Non-Commented E-Poster, or Video' });
      }
    } else {
      finalPresentationType = null; // No presentation type for refused
    }

    const existing = db.prepare('SELECT id FROM reviews WHERE abstract_id = ? AND reviewer_id = ?').get(abstract_id, req.user.id);

    if (existing) {
      db.prepare(`
        UPDATE reviews SET criteria1=?,criteria2=?,criteria3=?,criteria4=?,verdict=?,presentation_type=?,comments=?,updated_at=unixepoch()
        WHERE abstract_id=? AND reviewer_id=?
      `).run(criteria1, criteria2, criteria3, criteria4, verdict, finalPresentationType, comments || '', abstract_id, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO reviews(abstract_id, reviewer_id, criteria1, criteria2, criteria3, criteria4, verdict, presentation_type, comments)
        VALUES(?,?,?,?,?,?,?,?,?)
      `).run(abstract_id, req.user.id, criteria1, criteria2, criteria3, criteria4, verdict, finalPresentationType, comments || '');
    }

    // Update abstract status
    db.prepare("UPDATE abstracts SET status='Waiting for Review', updated_at=unixepoch() WHERE id=? AND status='Submitted'").run(abstract_id);

    res.json({ message: 'Review submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
