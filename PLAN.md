# Easel (working name)

A browser design canvas where people and agents build websites together.
Entry for The WebMCP Challenge. Deadline: Sep 3 2026, 1:00pm PDT (Sep 4 1:30am IST).

## the pitch

Paper.design proved that a canvas built on real HTML and CSS is the right place
for humans and agents to design together. But its agent access lives in a
desktop app with a local MCP server on one machine. Browser agents like ChatGPT
cannot touch it, teammates cannot watch the agent work, and every write goes
through a terminal permission dialog.

Easel puts the canvas itself on the tool surface. The page registers WebMCP
tools on `document.modelContext`, so:

- open the link in the ChatGPT desktop browser and ChatGPT designs with you in
  the same tab, no install, no server
- run one command in the terminal and Claude Code or Codex drives the same
  canvas by name through a small bridge
- you keep editing by hand the whole time; the agent edits the real nodes, not
  a picture of them

One line: the connected canvas, browser native and agent agnostic.

## what the user does

1. opens the app, creates an artboard (desktop or mobile width)
2. draws sections by hand: headline, text, buttons, images, containers
3. selects nodes, edits text inline, changes styles in the properties panel
4. asks an agent for the boring parts: "add a three tier pricing section that
   matches this headline", "make a mobile version of this artboard", "rename
   the layers properly", "make the CTA green"
5. sees agent changes land live, tweaks them, undoes if wrong
6. hits publish and gets a real URL of the site they built together

## what the agent does

Reads the document by node id, writes HTML and CSS into nodes, and can ask the
human to point at things. Every write is visible and undoable. Destructive or
big writes can land as a proposal the human accepts.

## document model

- a document has pages? no. one document, many artboards. keep it flat.
- an artboard is a root node with a width, height, name, background
- nodes are a tree: `{ id, type, name, tag, props, style, text, children }`
  - type: artboard | frame | text | image | button | link
  - style is a plain CSS object, applied inline in the editor and exported as
    Tailwind or inline styles
  - ids are short stable strings, never reused, so an agent can hold them
- the store is a single zustand store with snapshot undo and redo
- everything the UI does goes through store actions, and every tool calls the
  same actions. one code path for human and agent

## WebMCP tools (registered on document.modelContext)

Read, all readOnlyHint true:

| tool | input | returns |
| --- | --- | --- |
| get_document | none | artboards with ids, names, sizes, node counts |
| get_selection | none | selected node ids with type, name, size, artboard |
| get_node | id | full node with style, text, children ids |
| get_tree | id, depth | compact indented text tree for orientation |
| get_styles | ids | computed style summary per node |
| get_html | id | the html and css of a node |
| get_jsx | id, style: tailwind or inline | react jsx export |

Write:

| tool | input | notes |
| --- | --- | --- |
| create_artboard | name, width, height, background | returns id |
| write_html | parent id, html, mode insert or replace | parses html into nodes, returns created ids |
| update_styles | [{ id, style }] | batch, merges |
| set_text | [{ id, text }] | batch |
| rename_nodes | [{ id, name }] | batch |
| move_node | id, parent id, index | reparent or reorder |
| duplicate_node | id | returns new id |
| delete_nodes | ids | consequential, goes through proposal when more than 3 nodes |
| select_nodes | ids | moves the human's selection, scrolls into view |

Collaboration:

| tool | input | notes |
| --- | --- | --- |
| request_pointer | question | resolves only when the human clicks a node, returns its id. this is the "which one do you mean" moment |
| propose | description, ops | lands as a ghost on the canvas with accept and reject buttons; accept_proposal and reject_proposal are registered only while one is pending |
| publish | none | deploys the current artboard to a public url, consequential |

Rules for all tools: return real post action state (ids, counts), never
`{ ok: true }` alone. Return descriptive errors the model can act on. Keep
outputs short. Register once on load, idempotent, with one AbortController.
Fire on `document.modelContext` with `navigator.modelContext` fallback.

## terminal bridge

`npx easel-bridge` (name tbd) starts:

- a stdio MCP server that Claude Code or Codex connects to
- a local websocket on 127.0.0.1 with a pairing code

The page shows a "connect terminal" button. Paste the code, the page opens the
socket, calls `getTools()` and mirrors every tool over the wire. The MCP server
lists them by name and sends `tools/list_changed` whenever the page's
`toolchange` fires. Calls go page side through `executeTool`, so the browser
stays the single source of truth and nothing is duplicated.

Setup for the user:

```
claude mcp add easel -- npx easel-bridge
```

Fallback if the bridge slips: chrome-devtools-mcp with
`--autoConnect --categoryExperimentalWebmcp=true` already exposes the page tools.

## activity log

A panel on the page listing every tool call with inputs and results, and a
tag for who called it (ChatGPT, terminal, human). Judges and the video need
this. Agent edited nodes get a brief highlight.

## stack

Vite, React 19, TypeScript, Tailwind v4, zustand. No backend for the editor.
Publish goes to a Cloudflare Worker with KV storing the html at a slug.
Deploy the app to Cloudflare Pages.

## out of scope

Components and variants, multiplayer, image generation, Figma import, freeform
absolute positioning (artboards use flow layout with flex and grid), auth.

## submission checklist

- live URL works in ChatGPT desktop and in Chrome 149+ with
  chrome://flags/#enable-webmcp-testing
- public repo with LICENSE file visible at the top
- video under 3 minutes, public on YouTube, audio, strongest moment first
- text description: why WebMCP fits, how UX improves, what humans and agents
  do together, how it was implemented
- nothing touched after the deadline

## video script (under 3 minutes)

0:00 open the app in the ChatGPT browser, type a headline by hand
0:15 "add a pricing section with three tiers that matches my headline". it
     appears live. change one price and a color by hand
0:45 "make a mobile artboard of this". second artboard appears
1:00 in Claude Code: "make the CTA on the hero green and rename the layers".
     canvas updates in the browser while typing in the terminal
1:25 Claude Code asks "which card should be highlighted", you click one,
     it applies the style
1:45 publish. open the real URL. site built by you and two agents together
2:10 thirty seconds on how: document.modelContext tools, the bridge, the
     proposal and pointer tools, the activity log

## time plan (about 9 hours from 4:30pm IST)

| when | what |
| --- | --- |
| 4:30 to 7:30 | store, node model, tools, bridge CLI. UI in parallel |
| 7:30 to 9:30 | wire UI to store, test in ChatGPT and Chrome, publish worker, deploy |
| 9:30 to 11:30 | video, README, devpost text, submit |
| 11:30 to 1:30 | buffer. no new features |
