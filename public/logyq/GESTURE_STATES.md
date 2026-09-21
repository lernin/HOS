# LOGYQ mobile hold-drag states

Phone only (`logyq-mobile-v162`). Finger grammar: flick create / 160ms hold-drag / slide-to-pan / 360ms double-tap edit.

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Arming: pointerdown on a card
  Idle --> MapPan: pointerdown on empty space
  Arming --> CardPan: move > 8px before 160ms
  Arming --> Latched: still 160ms (≤8px)
  Arming --> Idle: release as tap / flick
  CardPan --> Idle: release (flick restores view)
  MapPan --> Idle: release
  Latched --> Still: finger within 16px of latch
  Latched --> Moved: finger leaves 16px
  Still --> Moved: finger leaves 16px
  Still --> Idle: release / cancel / second finger\n(no tree mutate, no bank)
  Moved --> Idle: drop on map\n(commitTree)
  Moved --> Idle: chip-dwell 480ms then release\n(bank after cleanup)
  Moved --> Idle: cancel / second finger / dock-near\n(no commit, no bank)
```

```
idle
  │ pointerdown on card
  ▼
arming (160ms, 8px slop)
  ├─ slide >8px before 160ms ──► card-pan (map follows finger; card stays)
  │                                release: flick (52/340/1.45) restores + create
  │                                else pan sticks
  ├─ release ≤11px ─────────────── tap / double-tap / paint
  └─ still 160ms ────────────────► latched (clone lifts 1.1cm; ghost; freeze)
       ├─ still (≤16px) ──release──► idle (no splice, no bank)
       └─ moved (>16px)
            ├─ release on map ──────── commitTree
            ├─ chip inner 44% + 480ms ─ bank
            └─ cancel / 2nd finger ─── idle
```

## Invariants

| Rule | How |
|---|---|
| Origin keeps layout space until commit | `holdDragFrozen()` while `body.v2-branch-drag` and `__logyqHoldDragCommit` unset. `layoutAndRender` and bank splices no-op. Gestures set the commit flag only for a real move-drop. |
| Stay-still never banks | `activeDockKind` is `none` until `STILL_PX` (16). `addWords` / contextmenu no-op unless `__logyqHoldDragAllowBank`. That flag is set only for move + chip + 480ms dwell. |
| Map does not jump on latch | No `shiftMapOnLatch`. Clone uses `fingerOffset` `{0, -1.1cm}`; d3 is not fed that offset until the finger leaves `STILL_PX`. |
| 1.1cm lift is clone-only | `#logyq-v162-branch-preview` follows the finger + lift. Live `g.node` stays in its cell as a dashed ghost (`v2-branch-origin-ghost`). |
| Hold-drag pan is center-offset | Finger offset from the viewport center, after a 56px dead zone. Content leash leaves ~⅓ viewport empty on the leading edge. |
| Early card slide pans the map | Phone `d3.zoom` starts on the card the same as empty space. Move >8px before `HOLD_MS` 160 cancels the hold (zoom keeps panning). Still 160ms calls `stopZoomGesture` then lifts. |

## Thresholds

`HOLD_MS` 160 · `HOLD_SLOP` 8 · `STILL_PX` 16 · `OFFSET_UP_CM` 1.1 · `BANK_DWELL_MS` 480 · chip hit = inner 44% inset 8px.
