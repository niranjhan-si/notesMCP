# Build log

**2026-09-11**

- Goal: let Claude Code read/write Apple Notes. Confirmed MCP is the right
  shape — it's a local stdio process Claude Code already knows how to launch,
  no hosting or auth needed.
- Apple Notes has no REST API. Two options: AppleScript (string-based,
  painful to get structured data out of) or JXA (`osascript -l JavaScript`,
  real JS objects, `JSON.stringify` back to Node). Went with JXA.
- Decided against TypeScript: the whole server is two files and a test. A
  build step would outweigh the benefit here.
- Built `src/notes.js` (JXA callers) and `src/index.js` (MCP tool
  registration via `@modelcontextprotocol/sdk`'s `McpServer` + stdio
  transport). 7 tools: list_folders, list_notes, get_note, search_notes,
  create_note, update_note, delete_note.
- First test run failed: asserted `get_note` throws after `delete_note`. It
  didn't — Notes.app soft-deletes into a "Recently Deleted" folder, so the
  note is still findable by id. Fixed the test to assert the note's folder
  changed instead of assuming it vanished. Good reminder that the test should
  encode the real behavior of the system it's testing, not an assumption
  about it.
- Registered with `claude mcp add --scope user` (not `local`) so it's
  available in every project, not just this one.

**2026-09-11 (later)**

- Added specific error messages per failure case (permission denied, app not
  running, note/folder not found, locked note, timeout) instead of one
  generic crash, plus an opt-in "report this" GitHub issue link for failures
  that aren't the user's fault to fix — nothing is ever sent automatically,
  the link just pre-fills an issue the user chooses to submit.
- Hit two real JXA quirks while wiring this up, both worth remembering:
  1. `osascript`'s default (non-`-s s`) output "prettifies" any string that
     looks like a JSON object/array, stripping the quotes that make it valid
     JSON. Fix: always pass `-s s`, which forces proper quoting — but that
     then double-encodes the string (quotes the already-stringified JSON), so
     the result needs `JSON.parse` twice.
  2. An exception thrown two function-calls deep (e.g. a wrapper function
     that calls a helper that throws) does NOT reach a `try/catch` further up
     the stack — osascript treats it as an uncaught execution error instead
     of a catchable JS exception. It only propagates correctly one call deep.
     Fix: no wrapper function around the script body; the try/catch sits
     directly around the real logic, which may call one level of helpers.
  Neither is documented anywhere obvious — found both by isolating minimal
  repro scripts and testing byte-for-byte output with `od -c`.
