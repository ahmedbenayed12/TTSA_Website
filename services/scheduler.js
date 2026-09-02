/**
 * scheduler.js
 * Runs background cron jobs for the TTSA platform.
 *
 * Job: auto-submit drafts after submission deadline
 *   - Fires every minute.
 *   - If the submission_deadline has passed, promotes every 'Draft' abstract
 *     to 'Submitted' and stamps submitted_at with the current timestamp.
 *   - Logs how many abstracts were promoted each run.
 */

const cron = require('node-cron');
const db   = require('../db/database');

function getDeadline(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? new Date(row.value) : null;
}

function autoSubmitDrafts() {
  const deadline = getDeadline('submission_deadline');

  // If no deadline is set yet, do nothing
  if (!deadline) return;

  // Only act once the deadline has passed
  if (new Date() <= deadline) return;

  // Fetch all drafts ordered by id (oldest first = lower submission numbers)
  const drafts = db.prepare(
    "SELECT id FROM abstracts WHERE status = 'Draft' ORDER BY id ASC"
  ).all();

  if (drafts.length === 0) return;

  // Wrap in a transaction so numbers are assigned atomically
  const promote = db.transaction(() => {
    let promoted = 0;
    for (const draft of drafts) {
      // Get next submission_number (same logic as the /confirm route)
      const nextNum = db.prepare(
        "SELECT COALESCE(MAX(submission_number), 0) + 1 AS n FROM abstracts WHERE submission_number IS NOT NULL"
      ).get().n;

      db.prepare(`
        UPDATE abstracts
        SET    status            = 'Submitted',
               is_locked        = 1,
               submission_number = ?,
               updated_at       = unixepoch()
        WHERE  id = ?
      `).run(nextNum, draft.id);

      promoted++;
    }
    return promoted;
  });

  const count = promote();

  if (count > 0) {
    console.log(`[Scheduler] ✅ Auto-submitted ${count} draft abstract(s) after deadline.`);
  }
}

function startScheduler() {
  // ── Run immediately on startup ──────────────────────────────────────────────
  console.log('[Scheduler] 🚀 Running auto-submit check on startup...');
  try {
    autoSubmitDrafts();
  } catch (err) {
    console.error('[Scheduler] ❌ Startup auto-submit error:', err.message);
  }

  // ── Then run every minute ───────────────────────────────────────────────────
  cron.schedule('* * * * *', () => {
    try {
      autoSubmitDrafts();
    } catch (err) {
      console.error('[Scheduler] ❌ Error in autoSubmitDrafts:', err.message);
    }
  });

  console.log('[Scheduler] 🕐 Auto-submit cron job started (runs every minute).');
}

module.exports = { startScheduler };
