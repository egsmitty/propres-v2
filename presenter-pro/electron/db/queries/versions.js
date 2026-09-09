// Restore points (plan A5). One row per deliberate save, newest last; the
// table is created by migration 5.
//
// Append-only on purpose: a single restore point is one reflexive Cmd-S away
// from useless, and every app this save model mirrors (Keynote, Google Docs,
// JetBrains) keeps a list. Only "Revert to Last Save" ships today, so nothing
// but getLatestVersion is wired to the UI — listVersions exists so the prune is
// testable and so a future history panel needs no schema change.
//
// NEWEST IS `id DESC`, NEVER `saved_at`: saved_at is unixepoch(), which has
// one-second resolution, so two saves in the same second would tie.

/** Restore points kept per presentation. Older ones are pruned on write. */
const MAX_VERSIONS_PER_PRESENTATION = 25;

function writeVersion(db, { presentationId, snapshot }) {
  const insert = db.prepare(`
    INSERT INTO presentation_versions (presentation_id, snapshot, saved_at)
    VALUES (?, ?, unixepoch())
  `);
  // Unbounded appends on a machine that runs for years is a slow disk leak, so
  // the prune rides along in the same transaction as the insert.
  const prune = db.prepare(`
    DELETE FROM presentation_versions
    WHERE presentation_id = ?
      AND id NOT IN (
        SELECT id FROM presentation_versions
        WHERE presentation_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
  `);

  db.transaction(() => {
    insert.run(presentationId, snapshot);
    prune.run(presentationId, presentationId, MAX_VERSIONS_PER_PRESENTATION);
  })();

  return { presentationId };
}

function getLatestVersion(db, presentationId) {
  return (
    db
      .prepare(
        `SELECT id, presentation_id, snapshot, saved_at
         FROM presentation_versions
         WHERE presentation_id = ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(presentationId) || null
  );
}

function listVersions(db, presentationId) {
  return db
    .prepare(
      `SELECT id, presentation_id, snapshot, saved_at
       FROM presentation_versions
       WHERE presentation_id = ?
       ORDER BY id DESC`
    )
    .all(presentationId);
}

function deleteVersionsFor(db, presentationId) {
  db.prepare('DELETE FROM presentation_versions WHERE presentation_id = ?').run(presentationId);
  return { presentationId };
}

module.exports = {
  MAX_VERSIONS_PER_PRESENTATION,
  writeVersion,
  getLatestVersion,
  listVersions,
  deleteVersionsFor,
};
