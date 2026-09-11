// Assert-based self-check. Creates a real throwaway note in Notes.app,
// exercises the full CRUD path against it, then deletes it. Run manually:
//   npm test
import assert from "node:assert/strict";
import * as notes from "../src/notes.js";

const title = `notesmcp-test-${Date.now()}`;

console.log("create_note");
const created = notes.createNote(title, "hello from notesmcp");
assert.equal(created.title, title);

console.log("get_note");
const fetched = notes.getNote(created.id);
assert.equal(fetched.title, title);
assert.match(fetched.body, /hello from notesmcp/);

console.log("search_notes");
const hits = notes.searchNotes(title);
assert.ok(hits.some((n) => n.id === created.id), "search did not find the note");

console.log("update_note (replace)");
notes.updateNote(created.id, "updated body");
assert.match(notes.getNote(created.id).body, /updated body/);

console.log("update_note (append)");
notes.updateNote(created.id, "appended text", "append");
assert.match(notes.getNote(created.id).body, /appended text/);

console.log("list_notes includes it");
assert.ok(notes.listNotes().some((n) => n.id === created.id));

console.log("delete_note");
notes.deleteNote(created.id);
// Notes.app soft-deletes into "Recently Deleted" rather than purging immediately.
assert.equal(notes.getNote(created.id).folder, "Recently Deleted");

console.log("error handling: note not found");
try {
  notes.getNote("no-such-note-xyz");
  assert.fail("expected NOTE_NOT_FOUND");
} catch (e) {
  assert.equal(e.code, "NOTE_NOT_FOUND");
  assert.equal(e.reportable, false); // user-fixable, not a bug report
}

console.log("error handling: folder not found");
try {
  notes.listNotes("no-such-folder-xyz");
  assert.fail("expected FOLDER_NOT_FOUND");
} catch (e) {
  assert.equal(e.code, "FOLDER_NOT_FOUND");
}

console.log("PASS");
