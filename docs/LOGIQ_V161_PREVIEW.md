# LOGiQ v161 recovery and mobile preview

## Release boundaries

- Immutable baseline: `/logiq-v161-legacy/`
- Working preview: `/logiq-v161/`
- Baseline tag: `logiq-v161-legacy-baseline-20260913`
- Stable preview branch: `preview/logiq-v161-recovery-mobile-autosave-20260913`
- Gesture prototype branch: `preview/logiq-v161-gesture-prototype-20260914`
- Approval gate: do not merge this branch to `main` until the preview regression workflow passes and the preview is explicitly approved.

The working page is a direct copy of the recovered source. More than 248,000 leading source bytes remain identical to the checksum-locked baseline. A small bridge is appended after legacy initialization, and all new UI and persistence code lives in `public/logiq-v161/logiq-preview.js`. This keeps the legacy closure and handler order intact.

Vercel uses clean URLs and redirects `/logiq-v161/index.html` to `/logiq-v161`. The integration seam therefore loads the enhancement and logo assets from absolute `/logiq-v161/...` paths. Relative paths silently resolve at the site root after that redirect and must not be reintroduced.

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

Phone UI is enabled below `700px`, plus coarse-pointer or hoverless viewports up to `1200px` wide. The wider touch breakpoint is intentional: Android can expose a roughly 980px CSS viewport when a link opens with desktop-like page scaling. Desktop fine-pointer layouts retain the legacy header, controls, tree, Dock, drag, Trash, pointer, and keyboard behavior.

On phone layouts:

- a 48px header (44px in short landscape) contains LOGiQ identity, a type-or-speak field, microphone, Undo, a permanent crosshair/Fit control, save-state dot, and overflow menu;
- Maps, Mix, Word Dock, Help, and typed-add variants appear on demand in the overflow menu;
- account text is not duplicated into the phone header;
- the permanent Trash target stays hidden, including during drag; deletion remains available after selecting a node;
- selecting a node reveals contextual navigation, Edit, Delete, and a green directional-create puck attached to the selected card;
- arrow controls mirror keyboard navigation;
- the Word Dock remains reachable and scrollable above the contextual action bar;
- map/library and PIN interfaces use touch-sized dialogs and controls.

### Directional creation and voice

The selected card itself keeps the legacy drag/reparent handler. This is deliberate: using the same one-finger surface for both reparent and create would make the intent ambiguous and could damage the tightly coupled legacy drag path. A small green `+` puck appears beside the selected card instead. Flick the puck at least 48 CSS pixels within 850ms:

| Flick | Equivalent legacy command | Result |
|---|---|---|
| Up | `Shift+I` | Insert an intermediary parent above the selected non-root card |
| Left | `Shift+J` | Insert an older sibling |
| Down | `Shift+K` | Add a child |
| Right | `Shift+L` | Insert a younger sibling |

The direction preview appears while the puck moves, and supported devices vibrate once when the commit threshold is crossed. On release, LOGiQ creates a blank card through the existing legacy command, starts microphone capture, and shows a Stop pill. Stop uploads the clip to the existing `/api/transcribe` endpoint; successful text renames the exact new card and enters normal autosave. If microphone permission or transcription fails, the new card remains selected and opens for typing. The header microphone performs voice-to-text into the compact entry field without creating a card.

Touch responsibilities therefore remain unambiguous:

- two fingers pinch the existing D3 canvas zoom;
- one finger pans even when the gesture begins over an unselected card;
- a short, stationary tap selects a card;
- only the selected card accepts drag/reparent gestures;
- flick the attached `+` puck to create and dictate a related card.

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
| Mobile | Compact portrait/landscape shell, permanent Fit, hidden Trash, on-demand panel, contextual navigation/edit, 980px Android-style viewport |
| Touch arbitration | Pan beginning over an unselected card, tap-to-select, selected-only drag/reparent |
| Gesture/voice | Selected-card create puck, child relationship, mocked microphone/transcription, resulting label |
| Offline | Local pending snapshot, Offline state, online retry to Saved |

The workflow is `.github/workflows/logiq-v161-preview.yml`. It builds HOS, runs the immutable baseline checks, installs pinned Playwright/Chromium and D3 test fixtures, starts Vite, and runs the desktop/mobile smoke suite on preview pushes and matching pull requests. CI intercepts the legacy jsDelivr request with the pinned D3 fixture so the smoke result does not depend on third-party CDN availability.
