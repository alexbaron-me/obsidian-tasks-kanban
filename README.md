# Tasks Board

A Kanban board for Obsidian whose cards are your real tasks — the `- [ ]` lines already scattered
across your vault — sourced live from the [Obsidian Tasks](https://publish.obsidian.md/tasks/)
plugin's cache. The board is a view, never a copy: moving a card writes a field into the task's
source line, and deleting a board deletes no tasks.

Boards live in `.board` files (YAML), each holding one or more views: a tab strip, a filter
button, and a settings panel, in deliberate imitation of Obsidian Bases.

**Hard dependency:** the [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks)
must be installed and enabled. Without it, every board renders a single error panel with an
install link — there is no degraded mode.

## Status

Implements the full specification this repo was built from: query engine, board schema and YAML
round-trip, all three column generators (explicit / rolling / auto), manual ordering, swimlanes,
the write layer (including recurring-task completion via the Tasks API), settings cascade,
drag-and-drop, and `.board` embedding.

**Known gap:** `Shift+←/→/↑/↓` keyboard shortcuts for moving a card between columns or
reordering it within a bucket are not wired up; the equivalent is available via mouse
drag-and-drop and the card context menu. Everything else in the interaction model (`Space` to
toggle done, `Enter` for the click action, `E` to edit, arrow-key focus movement, right-click
menu, quick-add, postpone, the `tasks-board://` URI handler) is implemented.

## Board layout

The whole board is a single CSS grid. One row of column headers sits at the top and each swimlane
is a horizontal band beneath it — headers and cells alike are direct grid items, which is what
keeps every lane's cells locked to the same column tracks.

The styling is deliberately flat and compact: hairlines rather than filled cells and gaps,
hierarchy carried by type weight and colour (column name, then lane name, then card text, then
metadata), and controls that aren't part of reading the board — quick-add, the card menu — kept
hidden until their row is hovered or focused. Column headers stay pinned while you scroll
vertically, lane headers stack beneath them, and lane labels stay pinned to the left edge while the
columns scroll horizontally. Collapsing a lane leaves a thin row of per-column counts behind, so a
folded lane still shows where its work sits.

Spacing comes from one set of custom properties on the board root, retuned by the cascaded
`density` setting (`compact`, the default, or `comfortable`).

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # typecheck + production build
npm test         # vitest — 360+ tests
npm run lint      # eslint
```

To try it in a real vault: copy `main.js`, `manifest.json`, `styles.css` into
`<Vault>/.obsidian/plugins/tasks-board/`, or symlink this repo there during development.

`test-vault/` is a small fixture vault (Tasks plugin config, ~50 tasks across the shapes named in
the spec's testing section, and three `.board` files — minimal, full, and deliberately malformed)
for manual verification inside a real copy of Obsidian.

## Architecture

- `src/query/` — the instruction-grammar engine (lexer → parser → compiler) shared by board
  filters, sort, group, and accent rules. See `docs/query-syntax.md`.
- `src/model/` — `.board` YAML schema/validation and the `BoardStore`/`BoardModel` that own
  comment-preserving round-trip persistence.
- `src/board/` — bucket generation, manual order, swimlanes, auto-hide, accent matching, chips,
  and the drop-decision logic, all independent of any UI framework.
- `src/write/` — the single write path for task mutations (`TaskWriter`), field serialisation in
  either the Tasks emoji or Dataview format (`FieldWriter`), and id generation.
- `src/integration/` — reads from the Tasks plugin's cache/config/API. See
  `src/integration/NOTICE.md` for attribution on the cache-subscription technique.
- `src/ui/` — the Preact render tree (`renderBoard` is the single leaf-free entry point shared by
  the `TextFileView` shell and the embed/codeblock path) and the global settings tab.

## License

0BSD — see `LICENSE`.
