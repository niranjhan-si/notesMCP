import { release } from "node:os";

const REPO_ISSUES_URL = "https://github.com/niranjhan-si/notesMCP/issues/new";

// Codes that mean "the user needs to do something", not "the code is broken" —
// no point offering to file a GitHub issue for these.
const USER_FIXABLE = new Set(["PERMISSION_DENIED", "APP_NOT_RUNNING", "NOTE_NOT_FOUND", "FOLDER_NOT_FOUND", "NOTE_LOCKED"]);

const FRIENDLY = {
  PERMISSION_DENIED:
    "Claude isn't allowed to control Notes.app yet. Open System Settings > Privacy & Security > Automation, and enable the app you're running Claude Code from (e.g. Terminal) for Notes.",
  APP_NOT_RUNNING: "Notes.app isn't running or couldn't be reached. Open Notes.app and try again.",
  TIMEOUT: "Notes.app took too long to respond (your notes library may be very large). Try a narrower search or a specific folder.",
  NOTE_NOT_FOUND: (detail) => `No note found matching "${detail}".`,
  FOLDER_NOT_FOUND: (detail) => `No folder named "${detail}". Use list_folders to see available folders.`,
  NOTE_LOCKED: (detail) => `The note "${detail}" is password-locked in Notes.app and can't be read or edited from here. Unlock it in Notes first.`,
};

export class NotesMcpError extends Error {
  constructor(code, message, raw) {
    super(message);
    this.code = code;
    this.raw = raw;
    this.reportable = !USER_FIXABLE.has(code);
  }
}

function friendly(code, detail) {
  const entry = FRIENDLY[code];
  if (typeof entry === "function") return entry(detail);
  return entry || detail || code;
}

// Turns a raw osascript process failure (timeout, permission denial, or any
// other stderr text) into a NotesMcpError.
export function classify(err) {
  if (err.code === "ETIMEDOUT" || err.signal === "SIGTERM") {
    return new NotesMcpError("TIMEOUT", friendly("TIMEOUT"), err.message);
  }
  const stderr = (err.stderr || "").toString();
  if (/-1743|not authorized to send apple events/i.test(stderr)) {
    return new NotesMcpError("PERMISSION_DENIED", friendly("PERMISSION_DENIED"), stderr);
  }
  if (/application isn.t running|-600/i.test(stderr)) {
    return new NotesMcpError("APP_NOT_RUNNING", friendly("APP_NOT_RUNNING"), stderr);
  }
  return new NotesMcpError("UNKNOWN", stderr.trim() || err.message, stderr || err.message);
}

// Our JXA scripts throw `CODE:detail` for expected failures (see notes.js)
// and the outer try/catch there reports it as { error: "script_error", message }.
// Turn that back into the same NotesMcpError shape as classify() above.
export function classifyScriptError(message) {
  const match = /^([A-Z_]+):(.*)$/s.exec(message || "");
  if (!match) return new NotesMcpError("UNKNOWN", message, message);
  const [, code, detail] = match;
  return new NotesMcpError(code, friendly(code, detail), message);
}

export function reportUrl(err) {
  const code = err.code || "UNKNOWN";
  const title = `[auto-report] ${code}: ${err.message.slice(0, 80)}`;
  const body = [
    "Auto-generated from a notesMCP error. Feel free to add context.",
    "",
    `**Code**: ${code}`,
    `**Message**: ${err.message}`,
    `**Node**: ${process.version}`,
    `**macOS**: Darwin ${release()}`,
    err.raw ? `**Raw detail**: \`${String(err.raw).slice(0, 500)}\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${REPO_ISSUES_URL}?${new URLSearchParams({ title, body })}`;
}
