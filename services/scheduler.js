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

  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE abstracts
    SET    status       = 'Submitted',
           submitted_at = ?
    WHERE  status = 'Draft'
  `).run(now);

  if (result.changes > 0) {
    console.log(`[Scheduler] ✅ Auto-submitted ${result.changes} draft abstract(s) after deadline.`);
  }
}

function startScheduler() {
  // Run every minute: '* * * * *'
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
