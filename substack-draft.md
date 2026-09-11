# My notes live in Apple Notes. My thinking happens in Claude Code. Those two never met.

I take almost every note — meeting scribbles, half-formed ideas, the odd grocery list — in Apple Notes. I do almost all my actual thinking out loud with Claude Code. For a long time those were two separate rooms with no door between them: if I wanted Claude to see something I'd written, I had to go copy-paste it over by hand.

So I built the door: **notesMCP**, a small server that lets Claude read, search, create, update, and delete my Apple Notes directly.

## The shape of the bridge

MCP (Model Context Protocol) is the standard Claude Code uses to pick up new tools, and the part that made this an easy yes is that an MCP server is just a local process — Claude launches it, talks to it over stdin/stdout, and shuts it down. No hosting, no API keys, no auth flow. Which mattered a lot here, because Apple Notes has no public API of any kind.

I scoped it hard before writing a line: seven tools, the full CRUD surface a notes app needs and nothing more — `list_folders`, `list_notes`, `get_note`, `search_notes`, `create_note`, `update_note`, `delete_note`. No AI summarization baked in, no sync engine, no TypeScript build step. The whole server is a couple hundred lines across two files. When the entire project is that small, a build pipeline is pure overhead.

## The only way in

Since there's no API, the only way to touch Notes.app programmatically is Apple's decades-old automation layer — classic AppleScript, or its JavaScript cousin, JXA. I went with JXA, because it lets me build a plain JS object and hand it back to Node as JSON instead of parsing AppleScript's string output by hand. In theory, clean.

## A bug that wasn't a bug

The first real snag came from my own test, not the code. I wrote a self-check that creates a note, runs it through the full CRUD cycle, deletes it, and then asserts that reading it back throws — deleted things shouldn't exist anymore. The assertion failed. `get_note` found it fine.

Turned out Notes.app doesn't actually delete a note when you delete it — same as Mail, it moves the note into "Recently Deleted" for thirty days. My test was asserting behavior I'd assumed, not behavior the app actually has. I fixed it to check the note's folder changed instead of expecting it to vanish. Small bug, useful reminder: a test is only as good as its model of the real system, and mine was wrong.

## Two bugs nobody documents

The harder problems showed up later, once I went back to add proper error handling — specific messages for permission denial, missing notes, locked notes, timeouts — instead of one generic crash.

First, I wrapped the risky part of each script in a `try/catch` and had the catch block return a structured error as JSON. It didn't work. Failures that should've been caught cleanly came out instead as raw, uncaught execution errors from osascript itself, with a mangled, doubled message. I started cutting the script down to the smallest possible repro — a bare function that throws, wrapped in a try/catch — and found the actual boundary: an exception thrown from inside a function that's itself called by another function wrapped in a try/catch does not get caught. Throw from one call deep, it works. Throw from two, osascript just gives up and treats it as an uncaught crash. Nothing in Apple's docs mentions this. I only found it by shrinking the failing case until the exact line that broke it was obvious, then restructuring the whole server so every risky call sits directly inside its try block, never behind a wrapper function.

Second, once errors were catchable, the JSON coming back out was gibberish — `id:abc, title:hello` instead of `{"id":"abc","title":"hello"}`. `osascript`'s default output "prettifies" any string that looks like a JSON object, silently stripping the quotes that make it valid. I caught this by piping the raw output through `od -c` to see the actual bytes instead of trusting what my terminal displayed. The fix is a `-s s` flag that forces proper quoting — except that then double-encodes the string, so parsing it back takes two `JSON.parse` calls instead of one.

Neither of these is a hard bug. Both were invisible until I went looking, byte by byte, for why a script that looked correct kept behaving like it wasn't.

## Deciding what not to build

The last iteration wasn't code at all — it was scope. Once error messages existed, the obvious next question was: should the tool report failures back to me automatically? Real telemetry means hosting a collector, writing a privacy policy, and maintaining a service indefinitely — a standing commitment that's disproportionate to a single-developer local tool. Instead, a failure that isn't the user's fault to fix now includes a link that opens a pre-filled GitHub issue. Nothing is ever sent without someone deciding, in the moment, to click submit. It gets most of the value of "the owner finds out fast" without turning a weekend project into infrastructure I'd have to babysit.

## The takeaway

Every real problem in this build showed up at the seam between "what I assumed" and "what the system actually does" — a soft delete I didn't expect, an exception boundary Apple never documented, an output format that lies about being JSON. None of it was visible from the spec. All of it only showed up by running the thing, watching it fail, and shrinking the failure until the cause was obvious.

It's public if you want to see the code or run it yourself: [notesMCP](https://github.com/niranjhan-si/notesMCP).
