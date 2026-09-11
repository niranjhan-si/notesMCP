import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Apple Notes has no REST API, so every operation shells out to Notes.app via
// JXA (JavaScript for Automation). Each function below builds a small JS
// script, runs it with `osascript -l JavaScript`, and parses the JSON the
// script prints as its last expression.
function runJXA(script) {
  const file = join(tmpdir(), `notesmcp-${randomUUID()}.js`);
  writeFileSync(file, script);
  try {
    const out = execFileSync("osascript", ["-l", "JavaScript", file], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
    return JSON.parse(out);
  } catch (err) {
    if (err.stderr) throw new Error(err.stderr.toString().trim());
    throw err;
  } finally {
    unlinkSync(file);
  }
}

const lit = (value) => JSON.stringify(value); // safe embed of a JS value as a literal in the generated script

export function listFolders() {
  return runJXA(`
    const app = Application("Notes");
    JSON.stringify(app.folders().map(f => f.name()));
  `);
}

export function listNotes(folderName) {
  return runJXA(`
    const app = Application("Notes");
    const folderName = ${lit(folderName ?? null)};
    let notes = folderName
      ? app.folders().find(f => f.name() === folderName).notes()
      : app.notes();
    JSON.stringify(notes.map(n => ({
      id: n.id(),
      title: n.name(),
      folder: n.container().name(),
      modified: n.modificationDate().toISOString(),
    })));
  `);
}

// ponytail: matches by exact id, else first note with an exact (case-insensitive) title match.
// Good enough for a single-user tool; add fuzzy/duplicate-title handling if that ever bites.
function findNoteScript(idOrTitle) {
  return `
    const app = Application("Notes");
    const key = ${lit(idOrTitle)};
    const all = app.notes();
    let note = all.find(n => n.id() === key);
    if (!note) {
      note = all.find(n => n.name().toLowerCase() === key.toLowerCase());
    }
    if (!note) { JSON.stringify({ error: "not_found" }); }
  `;
}

export function getNote(idOrTitle) {
  const result = runJXA(`
    ${findNoteScript(idOrTitle)}
    if (typeof note === "undefined") {
      JSON.stringify({ error: "not_found" });
    } else {
      JSON.stringify({
        id: note.id(),
        title: note.name(),
        body: note.plaintext(),
        folder: note.container().name(),
        modified: note.modificationDate().toISOString(),
      });
    }
  `);
  if (result.error === "not_found") throw new Error(`No note found for "${idOrTitle}"`);
  return result;
}

export function searchNotes(query) {
  return runJXA(`
    const app = Application("Notes");
    const q = ${lit(query)}.toLowerCase();
    const hits = app.notes().filter(n =>
      n.name().toLowerCase().includes(q) || n.plaintext().toLowerCase().includes(q)
    );
    JSON.stringify(hits.map(n => ({
      id: n.id(),
      title: n.name(),
      folder: n.container().name(),
      modified: n.modificationDate().toISOString(),
    })));
  `);
}

export function createNote(title, body, folderName) {
  return runJXA(`
    const app = Application("Notes");
    const title = ${lit(title)};
    const body = ${lit(body ?? "")};
    const folderName = ${lit(folderName ?? null)};
    const folder = folderName
      ? app.folders().find(f => f.name() === folderName)
      : app.defaultAccount().defaultFolder();
    const note = app.make({
      new: "note",
      at: folder,
      withProperties: { name: title, body: body },
    });
    JSON.stringify({ id: note.id(), title: note.name(), folder: folder.name() });
  `);
}

export function updateNote(idOrTitle, body, mode = "replace") {
  const result = runJXA(`
    ${findNoteScript(idOrTitle)}
    if (typeof note === "undefined") {
      JSON.stringify({ error: "not_found" });
    } else {
      const addition = ${lit(body)};
      note.body = ${mode === "append" ? "note.body() + \"<br>\" + addition" : "addition"};
      JSON.stringify({ id: note.id(), title: note.name(), body: note.plaintext() });
    }
  `);
  if (result.error === "not_found") throw new Error(`No note found for "${idOrTitle}"`);
  return result;
}

export function deleteNote(idOrTitle) {
  const result = runJXA(`
    ${findNoteScript(idOrTitle)}
    if (typeof note === "undefined") {
      JSON.stringify({ error: "not_found" });
    } else {
      const id = note.id();
      const title = note.name();
      app.delete(note);
      JSON.stringify({ id, title, deleted: true });
    }
  `);
  if (result.error === "not_found") throw new Error(`No note found for "${idOrTitle}"`);
  return result;
}
