# LOGYQ persistence contract

Maps autosave to `localStorage.logyq_maps_v1` (plus `logyq_current_map_v1` / `logyq_pending_save_v1`). Snapshot is `JSON.stringify({ tree, word_bank })`. `LOGYQBridge.snapshot()` / `loadMap()` deep-clone the tree. Mix rebuilds nodes, so it must copy contract fields — not `{ name }` only.

## Card / node fields

| Field | UI use | Mix | Save / reload |
|---|---|---|---|
| `name` | Label on the card. Edit, render, voice rename write this. | Kept (shuffle key) | Kept |
| `color` | Paint fill (`paintUid` / `paintBranch`). Absent = default white. | Kept | Kept |
| `label`, `text`, `title`, `value` | Read-only fallbacks in `cardText` (ghost / MIC / blank check). Paint and edit do **not** write them. | Kept if present on the node | Kept if present |
| `_uid` | Session identity for selection, drag, paint. | **Reassigned** (`assignUids`) | Kept, then `assignUids` fills any missing |
| `children` | Tree shape | New hierarchy; cards move | Kept |

No other painted/annotated node fields exist in the UI (no flags, notes, voice blobs, or collapsed bits on `data`).

## Not on the card

- **Word Bank** is `string[]` (`word_bank`). Chips have no color. Mix-with-bank turns each word into a name-only card.
- Palette last-color is `logyq_paint_color_v1` (device chrome, not a map field).
- Layout (`x`/`y`), selection, and editor state are not saved.

## Round-trip

1. Paint writes `data.color`; rename writes `data.name`.
2. Mix (`randomizeTree`) copies `name` + `color` + any `label`/`text`/`title`/`value` onto the shuffled cards.
3. Autosave JSON-clones that tree. Open / `loadMap` clones it back.

GIQ `normalizeToTree` keeps the same card fields when importing JSON that already looks like a node.
