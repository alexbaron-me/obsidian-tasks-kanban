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
