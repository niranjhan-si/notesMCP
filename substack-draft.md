# My notes live in Apple Notes. My thinking happens in Claude Code. Those two never met.

I take almost every note — meeting scribbles, half-formed ideas, the odd grocery list — in Apple Notes. I do almost all my actual thinking out loud with Claude Code. For a long time those were two separate rooms with no door between them: if I wanted Claude to see something I'd written, I had to go copy-paste it over by hand.

So I had Claude Code build the door: **notesMCP**, a small server that lets Claude read, search, create, update, and delete my Apple Notes directly. I didn't write a line of it. What I owned was the problem, the scope, and every call about what it should and shouldn't do — the same job I'd do steering any engineer.

## The shape of the bridge

First decision: what's even the right way to connect these two things? I wasn't going to stand up a backend for a personal tool, so MCP (Model Context Protocol) was the obvious answer — it's the standard Claude Code already uses to pick up new tools, and it runs as a local process on my machine. No server to host, no API keys, no auth flow to build. That constraint alone ruled out a dozen fancier architectures before we wrote anything.

Second decision, and the one I was firmest about: scope. It would've been easy to let this sprawl into AI summarization, a sync engine, a nice UI. I cut all of that before we started. Seven tools, the full CRUD surface a notes app actually needs and nothing more — list folders, list notes, get a note, search, create, update, delete. No build pipeline. That's a PM call, not an engineering one: the smaller the surface, the less there is to maintain, document, and eventually explain to a reader who's never seen the code.

## The constraint nobody could scope around

Here's the wrinkle we didn't choose: Apple Notes has no public API. None. The only way in is Apple's decades-old automation layer — AppleScript, or its JavaScript cousin, JXA. That's not a design decision, that's the ceiling every Apple Notes tool on GitHub runs into, ours included. Worth knowing before you commit to a project like this: sometimes the platform decides your architecture for you, and the only real choice left is which flavor of workaround to use.

## A bug that wasn't a bug

The test we wrote to verify the build caught something interesting almost immediately: delete a note, then try to read it back, and it should be gone. It wasn't. Notes.app doesn't actually delete a note when you delete it — same as Mail's trash, it moves the note to "Recently Deleted" for thirty days.

That's not a code bug, it's a wrong assumption baked into the spec. I'd assumed "delete" meant "gone." It doesn't, and once I knew that, the fix was one line — check the note landed in the right folder instead of expecting it to vanish. Small thing, but it's the kind of gap that only surfaces once you actually run the thing against the real system instead of reasoning about it on paper.

## The part where the platform fought back

Once the basics worked, I asked for something any PM would ask for next: don't just crash, tell me *why* it failed — permission denied, note not found, note locked, timed out. Turning a stack trace into a message a normal person could act on.

That's where it got slow. Getting failures to report cleanly took two separate rounds of "it should work, it doesn't, why" before Claude tracked both down to undocumented quirks in Apple's automation layer itself — not bugs in our code, bugs in the 20-year-old bridge we were forced to build on top of. One was an error-handling boundary that silently swallowed exceptions under specific conditions. The other was the tool's own output quietly corrupting anything that looked like structured data before it ever reached us. Neither is documented anywhere. Both took deliberately shrinking the failing case down to the smallest possible repro to actually isolate.

I didn't do that debugging — Claude did. What I did was insist we not ship "error handling" that was really just a slightly nicer crash, and push until the messages were actually specific enough to act on.

## Deciding what not to build

The last iteration wasn't code at all — it was a product conversation. Once error messages existed, the obvious next ask was: should the tool report failures back to me automatically? I pushed on this one myself. Real telemetry means standing up a collector, writing a privacy policy, and maintaining a service indefinitely — a standing commitment completely out of proportion to a single-developer local tool. So we scoped it down: a failure that isn't the user's fault to fix now includes a link that opens a pre-filled GitHub issue. Nothing sends automatically. Someone has to look at it and choose to click submit.

That's the tradeoff I'd make on a real product roadmap too — most of the benefit, none of the standing cost, and no infrastructure I'd have to babysit for a tool three people use.

## The takeaway

Nothing that actually went wrong here was visible from the spec. A soft delete I didn't expect. An error-handling boundary Apple never documented. An output format that lies about being JSON. All of it only showed up by building the thing, running it against reality, and being willing to say "that's not right yet" instead of shipping the first version that technically worked.

That's the job, whether you're writing the code or not: know what "done" actually means, and don't accept less than that because the code compiles.

It's public if you want to see it: [notesMCP](https://github.com/niranjhan-si/notesMCP).
