# LOGYQ Lab tab (live)

LOGYQ is a **sibling** Lab hub card next to LOGiQ v161. It does not replace LOGIQ.

## Registry (already wired)

React experiences in `src/main.tsx` (`View` / lazy worlds) are **not** how LOGiQ is registered. Standalone tools are injected as `.experience-card` articles on the hub grid from root `index.html`.

| Card | File | Id | Href |
|---|---|---|---|
| **LOGiQ v161** (keep) | `/index.html` | `#logiq-v161-hub-card` | `/logiq-v161/` |
| **LOGYQ** (this scaffold) | `/index.html` | `#logyq-hub-card` | `/logyq/` |

The LOGYQ injector runs after the LOGiQ card and inserts immediately after `#logiq-v161-hub-card`. MutationObserver + `popstate` match the existing Materials Studio / LOGiQ pattern.

No `src/main.tsx` change. No `logiq-*` production logic. No merge, no deploy.

## Phone check

Open The Lab hub → **LOGYQ** (Y) sits under **LOGiQ v161** (Q) → Go loads `/logyq/`.
