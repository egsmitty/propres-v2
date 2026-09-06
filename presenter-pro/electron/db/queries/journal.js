// Crash-recovery journal: one snapshot row per presentation while it has
// unsaved edits (see src/utils/recoveryJournal.ts for the policy). Table is
// created by migration 2.

function writeJournal(db, { presentationId, snapshot, baseUpdatedAt }) {
  db.prepare(
    `
    INSERT INTO presentation_journal (presentation_id, snapshot, saved_at, base_updated_at)
    VALUES (?, ?, unixepoch(), ?)
    ON CONFLICT(presentation_id) DO UPDATE SET
      snapshot = excluded.snapshot,
      saved_at = excluded.saved_at,
      base_updated_at = excluded.base_updated_at
  `
  ).run(presentationId, snapshot, baseUpdatedAt ?? null);
  return { presentationId };
}

function listJournals(db) {
  return db
    .prepare(
      'SELECT presentation_id, snapshot, saved_at, base_updated_at FROM presentation_journal'
    )
    .all();
}

function deleteJournal(db, presentationId) {
  db.prepare('DELETE FROM presentation_journal WHERE presentation_id = ?').run(presentationId);
  return { presentationId };
}

module.exports = { writeJournal, listJournals, deleteJournal };
