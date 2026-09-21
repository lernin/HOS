# LOGYQ

Isolated maintainability experiment. This is **not** LOGiQ and is **not** for production.

- **Baseline copied from:** `public/logiq-v161/` (working recovered engine + preview seam)
- **Not used as baseline:** `public/logiq-v162-mobile/` (iframe overlay on v161; does not contain the tree engine)
- **Immutable source of truth for LOGiQ:** `public/logiq-v161-legacy/` (untouched; LOGYQ must never edit any `logiq-*` path)

Open `/logyq/` in the Lab. Rebuild assembled files with `npm run assemble:logyq`. Run `npm run test:logyq`.

See `ARCHITECTURE.md` for modules and `NOT_REFACTORED.md` for internals left intact.
