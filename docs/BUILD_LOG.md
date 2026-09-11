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
