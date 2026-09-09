// Crash-recovery journal (migration 2). NOTHING WRITES THESE ANY MORE — plan
// A5 slice 3 removed the writer, because autosave puts edits in the real record
// and every autosave bumps `presentations.updated_at`, which would make every
// journal row stale before it was ever read. These two readers remain to drain
// rows left by a pre-autosave build.

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

module.exports = { listJournals, deleteJournal };
