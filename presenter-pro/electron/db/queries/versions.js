// Restore points (plans A5, A6). One row per deliberate save, newest last;
// the table is created by migration 5.
//
// Append-only on purpose: a single restore point is one reflexive Cmd-S away
// from useless, and every app this save model mirrors (Keynote, Google Docs,
// JetBrains) keeps a list.
//
// NEWEST IS `id DESC`, NEVER `saved_at`: saved_at is unixepoch(), which has
// one-second resolution, so two saves in the same second would tie.
//
// THE INVARIANT (plan A6): the newest version always equals the committed state
// of the presentation row. Dirty-on-open and Revert to Last Save both depend on
// it — see tasks/plan-A6-version-history.md before changing any write path.

const { versionsToPrune } = require('../versionRetention');

/**
 * Append a version, then thin the history.
 *
 * `now` is a parameter so the retention decision is testable; the policy itself
 * lives in versionRetention.ts and is pure. The query deliberately decides
 * nothing — local calendar arithmetic in SQL would be unreadable and untestable.
 */
function writeVersion(db, { presentationId, snapshot }, now = Date.now()) {
  const insert = db.prepare(`
    INSERT INTO presentation_versions (presentation_id, snapshot, saved_at)
    VALUES (?, ?, unixepoch())
  `);
  const listRefs = db.prepare(`
    SELECT id, saved_at FROM presentation_versions
    WHERE presentation_id = ?
    ORDER BY id
  `);

  db.transaction(() => {
    insert.run(presentationId, snapshot);
    const stale = versionsToPrune(listRefs.all(presentationId), now);
    if (stale.length) {
      const holes = stale.map(() => '?').join(', ');
      db.prepare(`DELETE FROM presentation_versions WHERE id IN (${holes})`).run(...stale);
    }
  })();

  return { presentationId };
}

/** One version by its own id. `presentation_id` is included so the restore path can check it belongs to the open document. */
function getVersion(db, versionId) {
  return (
    db
      .prepare(
        `SELECT id, presentation_id, snapshot, saved_at
         FROM presentation_versions
         WHERE id = ?`
      )
      .get(versionId) || null
  );
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

/**
 * Rows for the history list: id, timestamp and slide count, but NOT the
 * snapshot.
 *
 * Every text box in a snapshot carries the whole merged DEFAULT_TEXT_BOX and
 * DEFAULT_TEXT_STYLE, so a slide is roughly 1.1KB and an 80-slide service order
 * is ~90KB per version. Listing 40 of those would push ~3.6MB across IPC and
 * parse it all on the renderer thread, to display a number. The count is
 * computed here instead.
 */
function listVersionSummaries(db, presentationId) {
  return db
    .prepare(
      `SELECT id,
              saved_at,
              (SELECT COALESCE(SUM(json_array_length(section.value, '$.slides')), 0)
                 FROM json_each(snapshot, '$.sections') AS section) AS slide_count
       FROM presentation_versions
       WHERE presentation_id = ?
       ORDER BY id DESC`
    )
    .all(presentationId);
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
  writeVersion,
  getVersion,
  getLatestVersion,
  listVersionSummaries,
  listVersions,
  deleteVersionsFor,
};
