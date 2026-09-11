# notesMCP

An MCP server that gives Claude read/write access to Apple Notes on macOS.

Apple Notes has no public API, so this shells out to `osascript -l JavaScript`
(JXA) to drive Notes.app directly — the same approach every other Apple Notes
integration uses.

## Tools

| Tool | Description |
|---|---|
| `list_folders` | List all Notes folders |
| `list_notes` | List notes, optionally scoped to a folder |
| `get_note` | Get a note's full body by id or exact title |
| `search_notes` | Search titles/bodies for a substring |
| `create_note` | Create a note (title, body, optional folder) |
| `update_note` | Replace or append to a note's body |
| `delete_note` | Delete a note (moves to "Recently Deleted") |

## Prerequisites

- macOS with Notes.app
- Node.js 18+
- The first time a tool runs, macOS will prompt for permission to let your
  terminal/Claude Code automate Notes — grant it in
  **System Settings → Privacy & Security → Automation**.

## Install

```bash
git clone https://github.com/niranjhan-si/notesMCP.git
cd notesMCP
npm install
```

## Register with Claude Code

```bash
claude mcp add --scope user notesmcp -- node "$(pwd)/src/index.js"
```

`--scope user` makes it available in every Claude Code session, not just this
project. Verify with `claude mcp list`.

## Test

```bash
npm test
```

Creates a real throwaway note, runs it through create/get/search/update/list/delete,
then leaves it in "Recently Deleted" (Notes.app's normal soft-delete).

## Notes on the design

- Plain Node.js, no build step — the whole server is two files.
- Notes are matched by `id` (preferred) or exact title. Duplicate titles
  resolve to the first match; that's a known limitation, not a bug.
- `delete_note` mirrors Notes.app's own behavior: it moves the note to
  "Recently Deleted" rather than purging it immediately.

See [docs/BUILD_LOG.md](docs/BUILD_LOG.md) for how this was built, and
[ARTICLE.md](ARTICLE.md) for the writeup.
