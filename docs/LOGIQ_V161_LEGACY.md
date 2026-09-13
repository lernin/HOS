# LOGiQ v161 legacy baseline

## Preservation contract

The recovered v161 application is preserved byte-for-byte at `/logiq-v161-legacy/`.

- Source file: `public/logiq-v161-legacy/index.html`
- SHA-256: `14ba1d93c5ea9a772b7b0118a2ba5de6702164b222b8a93f4c35681ab64da66b`
- Recovered from: the seven gzip/base64 payload parts committed on `preview/logiq-v161-20260913`
- Source size: 248,582 bytes, 7,186 lines, CRLF line endings
- External runtime dependency: D3 v7 from jsDelivr
- Data model: nested `{ name, children?, _uid? }` objects wrapped by `d3.hierarchy`

The baseline test reconstructs the compressed payload, compares it byte-for-byte with the legacy file, verifies the checksum, parses the inline script, and checks the major architecture markers. Do not format, normalize line endings, or edit this file. Add future behavior only to the working `/logiq-v161/` copy.

The internal HTML title says `LOGiQ v103`. That stale label is part of the recovered bytes and is intentionally unchanged in the immutable baseline.

## Architecture

LOGiQ v161 is a single HTML document containing its CSS, markup, and one large JavaScript IIFE. Its behavior is tightly coupled through shared closure state and DOM references.

1. `CONFIG`, `CONFIG_MOAT`, and `CONFIG_FLY` hold dimensions, detector geometry, drag thresholds, zoom bounds, and camera timing.
2. `state` owns the hierarchy, history, Word Dock, focus/group selection, drag state, editing state, zoom state, and V-hold state.
3. `elements` caches the SVG, header controls, Dock, Trash, settings, export dialog, and drawing layers.
4. `utils` assigns `_uid` values, clones trees, resolves paths and UIDs, and assigns transient hierarchy IDs.
5. `Detectors` builds invisible node/gap/root-above hit regions used by node and Word Dock dragging.
6. `dragManager` handles subtree, node-only, and multi-node drag/reparent operations plus Trash drops.
7. `treeManager` initializes D3 zoom/layout, renders nodes and links, runs Fit, and binds node handlers.
8. Global keyboard listeners implement selection navigation, group selection, structural V-movement, editing, deletion, Word Dock transfer, creation shortcuts, zoom, and modal controls.
9. `history` is an in-memory stack capped at 50 actions. Undo supports add, delete, move, rename, root replacement, and Mix snapshots.
10. Legacy local maps use `localStorage.savedMaps_v1`. The UI exposes Trees but has no Save button, so creating a saved-map record is not reachable from the normal baseline UI.

There are duplicate listeners and duplicate helper names. JavaScript declaration order and event capture order are therefore part of the legacy behavior. Refactoring them casually can change selection, double-click, keyboard, Mix, and map behavior.

## Starting state and navigation

- App boot generates a deterministic 30-node sample tree named `Node 01` through `Node 30`.
- Fit runs on boot.
- Mouse/touch drag on empty SVG pans the canvas; wheel/pinch zoom is constrained to 0.4–2.4.
- Wheel zoom is eased around the pointer. `Z`/`Shift+Z` zoom around the viewport center.
- Keyboard navigation uses arrows or `I/J/K/L`.
- With no focus, Down/Left/Right focuses the root; Up focuses the deepest node nearest the root's x-position.
- Up focuses the parent. Down prefers a middle child, then the nearest node in a deeper row. Left/Right moves across the current row and wraps.
- A moat check recenters keyboard focus when it approaches a viewport edge.
- `F` fits the whole tree. `Shift+F` centers the selected node without intentionally changing zoom.

## Selection and groups

- Plain node press focuses one node.
- Shift+press adds a node to the group; Shift+click on an already grouped node removes it.
- `G` toggles the focused node in the group.
- `Shift+G` clears group and focus.
- Escape closes the active editor/modal when applicable; otherwise it clears selection/group state through multiple legacy handlers.
- A group drag operates on top-level selected nodes, ignoring descendants whose ancestor is also selected.

## Editing and creation

- `E` opens the inline node-name editor for one selected/focused node.
- `Shift+E` opens the editor and clears its text.
- Enter commits an inline edit; Escape cancels; blur commits.
- Shift+Enter while editing commits and adds a new right sibling for immediate editing.
- `Shift+I` inserts a new parent above the focused non-root node.
- `Shift+J` inserts an elder/left sibling.
- `Shift+K` adds a rightmost child.
- `Shift+L` inserts a younger/right sibling.
- The help text says double-click renames, and a node double-click handler exists, but a capture listener later suppresses SVG double-clicks. Keyboard `E` is the dependable edit path in the recovered build.

## Header input and import

- Plain text may be comma-separated. Enter or left-click Add sends words to the Word Dock.
- Shift+Enter or right-click Add sends plain words under the focused node only when no group is active; otherwise it uses the Dock.
- JSON or GIQ-looking input is parsed as a tree/import rather than ordinary words.
- GIQ format is JSON, optional `###` Word Dock values, and optional `$$$` future data.
- Plain arrays, strings, numbers, existing `{name, children}` objects, and generic objects are normalized into tree form.
- `A` focuses the header input.
- Tab is used as a temporary navigation handoff from input/editor to canvas shortcuts.

## Drag, reparent, and structural V-movement

- Plain node drag moves the full subtree.
- Shift+drag moves only the node while its children remain/promote at the original location.
- Dragging selected group members moves the group's top-level nodes.
- Valid targets are another node, a sibling/cousin gap, an edge gap, or above the root.
- Dropping onto a node adopts the moved content as children.
- Dropping in a gap reorders or reparents at that position.
- Dropping above the root can promote the moved node to root.
- Dragging onto Trash deletes a subtree or selected group.
- Hold `V` with no active group and use Left/Right (`J/L`) to reorder or hop between adjacent parent groups.
- Hold `V` and use Up/Down (`I/K`) to structurally move the focused node up or down a level. Root cases promote/demote roots using special rules.
- With an active group, `V` moves grouped nodes under the focused target; `Shift+V` performs the node-only/abandonment variant.

## Word Dock

- Enter/left Add creates Dock chips; semicolon and comma separators are supported by the lower-level word parser.
- Click selects one chip; Shift+click toggles multiple chips.
- Drag chips to a node, a gap, above root, or empty canvas. Multiple selected chips move together.
- Right-click a chip sends the selected chip set under exactly one selected tree node.
- Right-click a node sends its subtree labels to the Dock and removes that subtree.
- Shift+right-click a node sends only that node label to the Dock and promotes its children in place.
- `D` sends the focused/selected subtree or group to the Dock.
- `Shift+D` sends only the selected node label(s) and promotes children.
- `W` cycles Dock position: bottom → left → hidden → bottom.
- Right-click Trash deletes selected Dock chips; dragging chips onto Trash deletes them.
- The help says `Ctrl+A` over the Dock selects all chips, but the recovered dispatcher checks Shift+A. This is a known documentation/code mismatch.
- A Shift+W “clear WordBank” block exists but is unreachable because the earlier general W handler returns first.

## Delete, Undo, Mix, Fit, export, and settings

- `T` deletes selected subtree(s).
- `Shift+T` deletes node(s) only and promotes their children.
- Trash drag supports single subtree and selected-group deletion.
- `U` or the Undo button reverses the latest supported in-memory action.
- Mix button press or `M` rebuilds a randomized 0–3-child tree while retaining the current root label.
- `Shift+M` or right-click Mix includes Word Dock items and clears the Dock.
- Mix automatically fits after the reposition transition.
- `P` opens export. Settings also exposes Export PNG.
- Export supports current view or full-map PNG, full-map SVG, padding, minimum label size, background, and optional title.
- Settings changes vertical spacing, caret indicators, visible detector overlays, and detector depth.
- `I`/`K` adjust spacing while Settings is open; `X` closes Settings.
- `?` opens Quick Help; clicking the backdrop or pressing Escape closes it.

## Known legacy risks

- One closure owns almost everything; there is no module boundary or formal command/event system.
- Duplicate event handlers and helper declarations make capture/bubble order significant.
- Several comments refer to Ctrl while code checks Shift.
- The double-click editor is wired and then globally suppressed.
- Some helper branches are dead or superseded but remain in the file.
- Maps save/list functions are local-only, prompt-based, and partially unreachable.
- The SVG and pointer model was designed for desktop; the permanent Trash target and fixed header consume too much mobile space.
- D3 is loaded from a third-party CDN, so offline boot is not guaranteed.
- The logo PNG referenced by metadata is absent; the preserved route includes the available SVG logo dependency.

