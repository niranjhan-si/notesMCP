import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as notes from "./notes.js";

const server = new McpServer({ name: "notesmcp", version: "1.0.0" });

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const errorText = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

function tool(name, description, schema, handler) {
  server.registerTool(
    name,
    { description, inputSchema: schema },
    async (args) => {
      try {
        return text(await handler(args));
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

tool("list_folders", "List all Apple Notes folders.", {}, () => notes.listFolders());

tool(
  "list_notes",
  "List notes, optionally scoped to one folder.",
  { folder: z.string().optional().describe("Folder name to filter by") },
  ({ folder }) => notes.listNotes(folder)
);

tool(
  "get_note",
  "Get the full body of one note by its id or exact title.",
  { note: z.string().describe("Note id or exact title") },
  ({ note }) => notes.getNote(note)
);

tool(
  "search_notes",
  "Search note titles and bodies for a substring.",
  { query: z.string().describe("Text to search for") },
  ({ query }) => notes.searchNotes(query)
);

tool(
  "create_note",
  "Create a new note.",
  {
    title: z.string(),
    body: z.string().optional().describe("Plain text body"),
    folder: z.string().optional().describe("Folder name; defaults to the account's default folder"),
  },
  ({ title, body, folder }) => notes.createNote(title, body, folder)
);

tool(
  "update_note",
  "Replace or append to an existing note's body.",
  {
    note: z.string().describe("Note id or exact title"),
    body: z.string(),
    mode: z.enum(["replace", "append"]).default("replace"),
  },
  ({ note, body, mode }) => notes.updateNote(note, body, mode)
);

tool(
  "delete_note",
  "Delete a note by its id or exact title.",
  { note: z.string().describe("Note id or exact title") },
  ({ note }) => notes.deleteNote(note)
);

await server.connect(new StdioServerTransport());
