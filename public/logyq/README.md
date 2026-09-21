# LOGYQ

Isolated maintainability experiment. This is **not** LOGiQ and is **not** for production.

- **Baseline copied from:** `public/logiq-v161/` (working recovered engine + preview seam)
- **Not used as baseline:** `public/logiq-v162-mobile/` (iframe overlay on v161; does not contain the tree engine)
- **Immutable source of truth for LOGiQ:** `public/logiq-v161-legacy/` (untouched; LOGYQ must never edit any `logiq-*` path)

Open `/logyq/` in the Lab. On a phone (or DevTools device mode, coarse pointer ≤1200px): palette in the header, tap a card to paint it, flick down to paint the branch; flick left/right/up still create; hold ~280ms to drag; double-tap to edit. There is no select/re-center on tap. Header mic is still voice; flick does not auto-record. Rebuild assembled files with `npm run assemble:logyq`. Run `npm run test:logyq`.

See `ARCHITECTURE.md` for modules, `SAFE_TO_RIP.md` for delete guidance, and `NOT_REFACTORED.md` for internals left intact.
