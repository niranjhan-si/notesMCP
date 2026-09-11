I gave Claude Code read/write access to Apple Notes. Here's how.

I take most of my notes in Apple Notes. I do most of my thinking out loud with
Claude Code. Those two things have never talked to each other, so I built the
bridge myself: **notesMCP**, a small MCP server that lets Claude list, read,
search, create, update, and delete my Apple Notes.

## Why MCP

MCP (Model Context Protocol) is the standard Claude Code uses to gain new
tools. The part that made this an easy yes: an MCP server is just a local
process. Claude Code launches it, talks to it over stdin/stdout, and shuts it
down when it's done. No server to host, no API keys, no auth flow — which
matters here, because Apple Notes has no public API at all.

## The only way in: AppleScript, or its JS cousin

macOS apps that don't ship an API are still automatable, via AppleScript. I
used **JXA** (JavaScript for Automation) instead of classic AppleScript,
because JXA lets me build a plain JS object, `JSON.stringify` it, and hand it
straight back to Node — no string-parsing AppleScript's output by hand.

Every tool call in notesMCP does roughly this:

```js
const app = Application("Notes");
const notes = app.notes();
JSON.stringify(notes.map(n => ({ id: n.id(), title: n.name() })));
```

...run via `osascript -l JavaScript`, from a Node child process, with the
result parsed back into JSON.

## What it exposes

Seven tools: `list_folders`, `list_notes`, `get_note`, `search_notes`,
`create_note`, `update_note`, `delete_note`. That's the full CRUD surface a
notes app needs — nothing speculative, nothing for a "someday" use case.

## What broke

The one real bug: my test asserted that `get_note` throws after
`delete_note`. It didn't. Notes.app doesn't actually delete a note when you
delete it — it moves it to "Recently Deleted" for 30 days, same as Mail's
trash. My test was asserting behavior I assumed rather than behavior the app
actually has. Fixed by asserting the note's folder changed to "Recently
Deleted" instead. Small bug, good reminder: write the test against the real
system, not your mental model of it.

## No build step, on purpose

The whole server is two files — `notes.js` (the JXA calls) and `index.js`
(the MCP tool registrations) — plus a test. No TypeScript, no bundler. When
the entire project is a few hundred lines, a build step is pure overhead.

## Using it

```bash
git clone https://github.com/niranjhan-si/notesMCP.git
cd notesMCP && npm install
claude mcp add --scope user notesmcp -- node "$(pwd)/src/index.js"
```

`--scope user` registers it once, for every project — not just the folder I
built it in.

Then in Claude Code:

> "Search my notes for 'apartment' and summarize what I've written."

...and it does, reading straight out of Notes.app.

## Try it

The repo's public: [github.com/niranjhan-si/notesMCP](https://github.com/niranjhan-si/notesMCP)

If you use Apple Notes and Claude Code, it's a `claude mcp add` away.
