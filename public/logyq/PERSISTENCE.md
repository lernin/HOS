# LOGYQ persistence contract

## Live store

Live maps use the same Procedia table and PIN-guarded RPCs as LOGiQ: `public.logiq_maps` on project `jzaghifuhinkzzhiojre`, via `logiq_map_list` / `logiq_map_save` / `logiq_map_delete`. Publishable URL/key match `src/lib/supabase.ts` and LOGiQ preview. The Lab PIN is `sessionStorage.logyq_lab_pin_v1`.

A row is:

| Column | Meaning |
|---|---|
| `name` | Map title |
| `tree` | GIQ JSON tree (see below) — **not** wrapped as `{ formatVersion, root }` |
| `word_bank` | GIQ `###` section as `string[]` |
| `created_at` / `updated_at` | Server timestamps; library sorts `updated_at` desc |

Existing rows are updated in place. Unknown JSON fields on tree nodes JSON-clone through. Do not migrate or destroy live rows.

## Open-map authority

`logiq_map_save` replaces the whole row and sets `updated_at = now()`. Nodes have no timestamps; the row's `updated_at` is the revision. An open map remembers that stamp when it loads or after a save.

- UI edits still debounce into `logiq_map_save`.
- While a saved map is open, the preview polls `logiq_map_list` about every 2s. A newer `updated_at` with a different tree is applied when she is not renaming a card.
- Before a save of an existing id, the same check runs. If the database moved and this tab has not edited since the last ack, the stale local tree is not posted.
- If both sides changed and no rename field is open, the trees merge by `_uid`. A field only one side changed keeps that side. If both changed the same field, the newer row wins.
- If a rename input is open, the remote row is held and the field keeps what she is typing. A note ("Database change came in.") sits on that input, just above it. The note is informational. Enter keeps her value for that card and then saves the merge. Escape or cancel takes the remote row.
- Thekonym onym/essence edits stay in `sessionStorage` (`logyq_thekonym_local_edits_v1`). This path does not write them.

Offline queue: `logyq_pending_save_v1`. Last-list cache: `logyq_maps_v1`. Current id: `logyq_current_map_v1`.

## GIQ (the existing map format)

Ashley’s interchange is GIQ, already in the engine (`exportGIQ` / `parseGIQ` / `tryParseGIQ` / `normalizeToTree`):

```
<JSON tree>
###
<comma-separated Word Bank>
$$$
```

- `exportGIQ()` writes `JSON.stringify(root.data)` + `###` + word bank + `$$$`
- `parseGIQ` / `tryParseGIQ` split those parts
- `normalizeToTree` accepts the JSON part

Live maps store the two GIQ parts as columns instead of one string. The JSON tree is nested nodes:

`{ name, children?, _uid?, color?, label?, text?, title?, value?, formatVersion?, … }`

Unknown keys JSON-clone through save/load. Paste/import via `normalizeToTree` keeps `color` and the label fallbacks and drops other extras.

## formatVersion

Root-only marker `2` stamped on save (`encodeMapTree`). Compatible with existing readers: they ignore unknown fields. Maps without it still load. Do **not** invent a rival wrapper schema.

## Card / node fields

| Field | UI use | Mix | Save / reload |
|---|---|---|---|
| `name` | Label on the card. Edit, render, voice rename write this. | Kept (shuffle key) | Kept |
| `color` | Paint fill (`paintUid` / `paintBranch`). Absent = default white. | Kept | Kept |
| `label`, `text`, `title`, `value` | Read-only fallbacks in `cardText`. | Kept if present | Kept if present |
| `formatVersion` | Root-only payload marker (`2`). | Left on the root | Stamped on save |
| `_uid` | Session identity. | **Reassigned** | Kept, then `assignUids` fills gaps |
| `children` | Tree shape | New hierarchy | Kept |
| other JSON keys | Not shown | Dropped by Mix | Kept on save/load clone |

Word Bank is `string[]` (`word_bank`). Palette last-color is `logyq_paint_color_v1`.

## Open (Drive-style)

Prior consultant notes said 0 maps should drop into a one-card editor already editing. That forced wipe-edit was the “big square slap” (keyboard wall on a blank root). Library is now home for both empty and populated accounts.

- **0 maps:** recents library, empty state + dominant **+ New**. No chooser. No first-run coaching / gamification. No forced editor. "No maps yet." is only for a successful `logiq_map_list` that returns zero rows.
- **Missing PIN:** a new origin has no `sessionStorage` PIN. The Connect dialog opens. Cancel, a rejected PIN, or a failed list says the maps are still saved and offers Connect again. That is not an empty library. The PIN is stored only after a Lab RPC accepts it.
- **1+ maps:** same library, recent first (`updated_at` desc), **+ New**. Tap a row to open. Maps icon / Trees returns to the library.
- **New / +:** one normal blank root card, not already editing. Double-tap / E still edits after she is in the canvas.
- Close does not dump you onto an empty canvas if no map is open.
- **Blank drafts do not persist.** An unsaved map with an empty/untitled root, no children, and no word bank is not queued or POSTed until she types a name or builds. Abandon / back from New leaves no `logiq_maps` row.
