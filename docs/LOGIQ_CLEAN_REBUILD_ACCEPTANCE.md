# Paper / LOGiQ clean rebuild acceptance checklist

Use with HOS Issue #108 and `docs/LOGIQ_CLEAN_REBUILD.md`.

## Desktop / shared visual parity

- Card width and height match the recovered v161 reference.
- Font size, line wrapping, padding, border, radius and shadow match v161.
- Horizontal and vertical tree spacing match v161.
- Connector geometry and selected/normal states match v161.
- Dragging does not resize or reflow a card merely because the gesture starts.
- Representative full-tree layout at a fixed viewport and zoom matches the reference within the defined screenshot tolerance.

## Shared editor behavior

- Add, rename, delete, reparent, reorder, Mix, Word Bank transfer and Undo each have one mutation owner.
- Desktop behavior remains equivalent to v161 unless Ashley explicitly approves a product change.
- Model mutation can be tested without relying on live SVG state.
- Rendering does not own structural mutation decisions.

## Mobile requirements retained from the recent prototype work

- One-finger pan from anywhere.
- Two-finger pinch from anywhere.
- Short movement before the hold threshold remains navigation.
- Stationary hold starts branch movement.
- The carried branch preserves normal card geometry.
- The full subtree moves together.
- A complete frozen source subtree remains at the origin during the gesture.
- Only a valid live node target or insertion caret commits a move.
- Blank or invalid release is an exact no-op/snapback.
- Edge auto-pan works while carrying a branch.
- Browser interruption or cancellation restores the exact pre-gesture tree and Word Bank state.
- Working Lock prevents structural edits while preserving pan, pinch, selection, Fit and deliberate rename/edit.

## Persistence safety

- Editor works against an in-memory persistence stub.
- Automated tests do not write production map data.
- Save/open/rename/delete failures cannot corrupt active editor state.
- Manual preview persistence remains isolated behind the existing PIN-guarded RPC boundary when persistence is reintroduced.

## Release gate

Do not propose production promotion until desktop parity, mobile requirements, persistence safety and Ashley's physical-phone acceptance are all satisfied on one exact commit.
