import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { classify, classifyScriptError } from "./errors.js";

const TIMEOUT_MS = 20_000;

// Shared helpers available inside every runJXA `body`. Expected failures
// (not found, locked, etc.) throw "CODE:detail" so classifyScriptError can
// turn them into a specific message instead of a generic crash.
//
// ponytail: JXA has a real quirk here — an exception thrown two function
// calls deep (e.g. a wrapper function calling one of these helpers) does NOT
// reach a try/catch further up the call stack; osascript treats it as an
// uncaught execution error instead. It only propagates correctly one level
// deep. So `body` below must call these helpers directly from the top-level
// try, never through an intermediate function.
const HELPERS = `
  function getFolder(name) {
    if (!name) return app.defaultAccount().defaultFolder();
    const f = app.folders().find(x => x.name() === name);
    if (!f) throw new Error("FOLDER_NOT_FOUND:" + name);
    return f;
  }
  function getNoteByKey(key) {
    const all = app.notes();
    let n = all.find(x => x.id() === key);
    if (!n) n = all.find(x => x.name().toLowerCase() === key.toLowerCase());
    if (!n) throw new Error("NOTE_NOT_FOUND:" + key);
    return n;
  }
  function safePlaintext(n) {
    try { return n.plaintext(); } catch (e) { throw new Error("NOTE_LOCKED:" + n.name()); }
  }
  function safeBody(n) {
    try { return n.body(); } catch (e) { throw new Error("NOTE_LOCKED:" + n.name()); }
  }
`;

// Apple Notes has no REST API, so every operation shells out to Notes.app via
// JXA (JavaScript for Automation). `body` is a top-level try-block statement
// list ending in `JSON.stringify(result);` as its last expression — that
// expression becomes the script's printed output.
function runJXA(body) {
  const script = `
    ${HELPERS}
    const app = Application("Notes");
    try {
      ${body}
    } catch (e) {
      JSON.stringify({ error: "script_error", message: String((e && e.message) || e) });
    }
  `;
  const file = join(tmpdir(), `notesmcp-${randomUUID()}.js`);
  writeFileSync(file, script);
  let out;
  try {
    // -s s forces osascript to print a properly quoted/escaped string instead
    // of its default "pretty" record display, which mangles JSON-looking output.
    out = execFileSync("osascript", ["-l", "JavaScript", "-s", "s", file], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      timeout: TIMEOUT_MS,
    });
  } catch (err) {
    throw classify(err);
  } finally {
    unlinkSync(file);
  }
  // -s s always represents our String completion value as a quoted/escaped
  // JSON string literal, so it takes two parses to get back to our object.
  const result = JSON.parse(JSON.parse(out));
  if (result && result.error === "script_error") throw classifyScriptError(result.message);
  return result;
}

const lit = (value) => JSON.stringify(value); // safe embed of a JS value as a literal in the generated script

export function listFolders() {
  return runJXA(`
    JSON.stringify(app.folders().map(f => f.name()));
  `);
}

export function listNotes(folderName) {
  return runJXA(`
    const notes = ${lit(folderName ?? null)} ? getFolder(${lit(folderName ?? null)}).notes() : app.notes();
    JSON.stringify(notes.map(n => ({
      id: n.id(),
      title: n.name(),
      folder: n.container().name(),
      modified: n.modificationDate().toISOString(),
    })));
  `);
}

export function getNote(idOrTitle) {
  return runJXA(`
    const n = getNoteByKey(${lit(idOrTitle)});
    JSON.stringify({
      id: n.id(),
      title: n.name(),
      body: safePlaintext(n),
      folder: n.container().name(),
      modified: n.modificationDate().toISOString(),
    });
  `);
}

export function searchNotes(query) {
  return runJXA(`
    const q = ${lit(query)}.toLowerCase();
    const hits = app.notes().filter(n =>
      n.name().toLowerCase().includes(q) || safePlaintext(n).toLowerCase().includes(q)
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
    const folder = getFolder(${lit(folderName ?? null)});
    const note = app.make({
      new: "note",
      at: folder,
      withProperties: { name: ${lit(title)}, body: ${lit(body ?? "")} },
    });
    JSON.stringify({ id: note.id(), title: note.name(), folder: folder.name() });
  `);
}

export function updateNote(idOrTitle, body, mode = "replace") {
  return runJXA(`
    const n = getNoteByKey(${lit(idOrTitle)});
    const addition = ${lit(body)};
    n.body = ${mode === "append" ? 'safeBody(n) + "<br>" + addition' : "addition"};
    JSON.stringify({ id: n.id(), title: n.name(), body: safePlaintext(n) });
  `);
}

export function deleteNote(idOrTitle) {
  return runJXA(`
    const n = getNoteByKey(${lit(idOrTitle)});
    const id = n.id();
    const title = n.name();
    app.delete(n);
    JSON.stringify({ id, title, deleted: true });
  `);
}
