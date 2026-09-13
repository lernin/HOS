# LOGiQ v161 recovery and mobile preview

## Release boundaries

- Immutable baseline: `/logiq-v161-legacy/`
- Working preview: `/logiq-v161/`
- Baseline tag: `logiq-v161-legacy-baseline-20260913`
- Preview branch: `preview/logiq-v161-recovery-mobile-autosave-20260913`
- Approval gate: do not merge this branch to `main` until the preview regression workflow passes and the preview is explicitly approved.

The working page is a direct copy of the recovered source. More than 248,000 leading source bytes remain identical to the checksum-locked baseline. A small bridge is appended after legacy initialization, and all new UI and persistence code lives in `public/logiq-v161/logiq-preview.js`. This keeps the legacy closure and handler order intact.

## Production persistence

The preview uses the existing production Supabase project and only these existing PIN-guarded RPCs:

| Action | RPC | Content |
|---|---|---|
| Autosave/create | `logiq_map_save` | Map name, nested tree JSON, Word Dock JSON, optional map UUID |
| Library list | `logiq_map_list` | Production maps ordered by the server function |
| Delete map | `logiq_map_delete` | Confirmed map UUID deletion |

No staging project, database migration, new table, policy, grant, or security-function change is part of this preview. The publishable browser key is the same production key already used by HOS. The Lab PIN is kept in `sessionStorage`, never written into source or persistent storage.

Autosave is debounced after tree or Word Dock mutations. The UI reports:

- **Saving** while a production RPC is in flight.
- **Saved** when the latest snapshot is confirmed by production.
- **Offline** when a snapshot is queued on the device because the network or PIN connection is unavailable.

The newest unsynced snapshot is stored locally, restored on reload, and retried after the browser returns online. There is no manual Save button.

## Maps library

The Trees control now opens a real library dialog rather than the legacy prompt flow. It supports:

- listing production maps;
- opening a map, including its Word Dock;
- creating a new map, which immediately enters autosave;
- renaming a map through an inline form;
- deleting a map after confirmation.

## Mobile-only behavior

The breakpoint is `700px`. Above it, legacy header, control, tree, Dock, drag, Trash, pointer, and keyboard behavior remain in place.

At mobile widths:

- a 52px header shows menu, LOGiQ identity, current map, save state, and library access;
- word entry and secondary commands appear only when the menu is opened;
- the permanent Trash target is hidden (it may appear temporarily during an active drag);
- selecting a node reveals contextual navigation, structural Move mode, Edit, Add Child, and Delete;
- arrow controls mirror keyboard navigation;
- Move plus an arrow mirrors hold-`V` structural movement;
- the Word Dock remains reachable and scrollable above the contextual action bar;
- map/library and PIN interfaces use touch-sized dialogs and controls.

## Regression coverage

`tests/logiq-v161-baseline.test.mjs` verifies the recovered payload checksum, exact legacy bytes, parseability, architecture markers, integration boundary, production-only endpoint, and RPC names.

`tests/logiq-v161-smoke.test.mjs` runs in Chromium against an ephemeral local build. Supabase RPC requests are intercepted, so CI never writes test data to production. It covers:

| Area | Checks |
|---|---|
| Load/render | Legacy and preview boot, 30-node tree, no page errors |
| Selection/edit | Node outline, inline rename, Undo |
| Drag/reparent | Pointer drag to a different parent, parent assertion, Undo |
| Trash/delete | Desktop Trash presence, `T` subtree deletion, Undo |
| Word Dock | Header entry, chip rendering, `D` transfer |
| Mix/Fit | Randomized structure, Undo snapshot restoration, zoom and Fit transforms |
| Keyboard | Arrow navigation, `A`, `D`, `E`, `F`, `M`, `T`, `U`, `W`, `Z` |
| Structural V | Hold-`V` plus arrow changes sibling order, Undo |
| Autosave | Debounce, RPC payload, Saved state, no manual Save control |
| Library | Production list RPC and rendered map entry |
| Mobile | Minimal header, hidden permanent Trash, on-demand panel, contextual navigation/edit |
| Offline | Local pending snapshot, Offline state, online retry to Saved |

The workflow is `.github/workflows/logiq-v161-preview.yml`. It builds HOS, runs the immutable baseline checks, installs pinned Playwright/Chromium and D3 test fixtures, starts Vite, and runs the desktop/mobile smoke suite on preview pushes and matching pull requests. CI intercepts the legacy jsDelivr request with the pinned D3 fixture so the smoke result does not depend on third-party CDN availability.
