# LOGYQ difficulty assessment — 2026-10-01

Assessed the 139 levels actually shipped in the preview, not the separate Supabase catalog. No gameplay, level IDs, progress, production data or matching rules changed in this assessment.

## Findings

- Tiers 4–10 do not represent an increasing challenge: average estimated scores range only from 9.86 to 10.19. Tier 10 averages 10.06, below Tier 4 at 10.08.
- 77/139 levels have no misleading **accepted addition** reachable from the presented starting card. This does not mean visually wrong/rejected choices are absent, or that children find every such puzzle easy.
- The 139 levels contain 87 distinct card bags modulo global color renaming. The other 52 repeat a bag; some use different starting cards, which can change the presented challenge.
- Three consecutive solves without rejected drops are required to advance one tier. Going from Tier 1 to Tier 10 requires at least 27 solves. A rejected drop resets the streak, so exploration can hold players at the same nominal tier indefinitely.
- The bank is populated by solved-tree traversal, making many cards arrive in solution order. This can reduce the challenge further; no bank order change made here.
- Higher-numbered levels are not necessarily harder. Deep Branch 43 scores 13.58 while Four Chain 126 scores 6.5. Those scores are design estimates, not measured human performance.

## Recommended bounded gameplay revision

Use measured puzzle features to assign genuinely increasing challenge bands; preserve all original IDs and saved clears. Keep two introductory placements (below and above), then move into chains and branches quickly. One clean solve advances to the next challenge band; a solve with mistakes still moves to a fresh puzzle, and never forces an endless repetition loop. Avoid repeating color-equivalent bags during a normal progression. Keep all levels selectable for practice. Shuffle the loose cards independently of solved order with a stable per-level seed. Verify progression, saved-progress compatibility, uniqueness unchanged, and phone bank/play behavior.

Implement this as a preview-only revision after the short design is approved. Larger puzzles, telemetry and new mechanics can wait. Current phase: playability assessment. Next decisive action: revise pacing and test the first few minutes with children.

## Method and limits

The read-only script `scripts/assess-logyq-difficulty.mjs` loads the current Game fragment through its existing test harness. For every level it enumerates all locally accepted **additions** from the actual presented anchor, including decoys, in the current parent/sibling seat grammar. It memoizes ordered physical-ID trees and determines whether each state can reach completion without rearranging. An addition is misleading when its child state cannot finish by further additions alone; repositioning may repair it. These are task-complexity signals, not a claim that a child reasons by this algorithm or that full geometric physical uniqueness is certified.

Score = 2 × required additions + excess child branches + log2(1 + misleading accepted additions) + 0.5 × log2(1 + maximum available accepted additions).

Weights are explicit provisional design judgments. No solve time, age calibration or human difficulty data is available. The canonical bag key preserves orientation and geometry and quotients only global color renaming. Required-vs-decoy and anchor distinctions are not included in bag equivalence.

Regenerate the JSON with `node scripts/assess-logyq-difficulty.mjs /tmp/logyq-difficulty.json`.

## Existing tiers

| Tier | Levels | Min score | Max score | Mean score | Levels with misleading additions |
|---|---:|---:|---:|---:|---:|
| 1 | 15 | 2.5 | 2.5 | 2.5 | 0 |
| 2 | 12 | 4.5 | 4.79 | 4.6 | 0 |
| 3 | 12 | 5.5 | 5.79 | 5.6 | 0 |
| 4 | 14 | 6.5 | 13.58 | 10.08 | 9 |
| 5 | 14 | 6.79 | 13.58 | 10.16 | 9 |
| 6 | 14 | 6.5 | 13.58 | 10.19 | 10 |
| 7 | 15 | 6.79 | 13.58 | 9.86 | 9 |
| 8 | 15 | 6.79 | 13.58 | 10.05 | 9 |
| 9 | 14 | 6.79 | 13.32 | 10.15 | 8 |
| 10 | 14 | 6.5 | 13.32 | 10.06 | 8 |

## Every level, ranked from easiest to hardest

Ties retain catalog order. Repeated bags and different anchors remain listed separately.

| Rank | Level | Existing tier | Required cards | Decoys | Reachable states | Misleading additions | Score |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | 1 · Whole → Layer Cake | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 2 | 2 · Whole → Diagonal Left | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 3 | 3 · Whole → Diagonal Right | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 4 | 4 · Layer Cake → Whole | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 5 | 5 · Layer Cake → Layer Cake | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 6 | 6 · Layer Cake → Diagonal Left | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 7 | 7 · Layer Cake → Diagonal Right | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 8 | 8 · Diagonal Left → Whole | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 9 | 9 · Diagonal Left → Layer Cake | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 10 | 10 · Diagonal Left → Diagonal Left | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 11 | 11 · Diagonal Left → Diagonal Right | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 12 | 12 · Diagonal Right → Whole | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 13 | 13 · Diagonal Right → Layer Cake | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 14 | 14 · Diagonal Right → Diagonal Left | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 15 | 15 · Diagonal Right → Diagonal Right | 1 | 2 | 0 | 2 | 0 | 2.5 |
| 16 | 16 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 17 | 18 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 18 | 19 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 19 | 21 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 20 | 22 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 21 | 24 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 22 | 25 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 23 | 27 · Chain | 2 | 3 | 0 | 3 | 0 | 4.5 |
| 24 | 17 · Chain | 2 | 3 | 0 | 4 | 0 | 4.79 |
| 25 | 20 · Chain | 2 | 3 | 0 | 4 | 0 | 4.79 |
| 26 | 23 · Chain | 2 | 3 | 0 | 4 | 0 | 4.79 |
| 27 | 26 · Chain | 2 | 3 | 0 | 4 | 0 | 4.79 |
| 28 | 29 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 29 | 30 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 30 | 32 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 31 | 33 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 32 | 35 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 33 | 36 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 34 | 38 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 35 | 39 · Branch | 3 | 3 | 0 | 3 | 0 | 5.5 |
| 36 | 28 · Branch | 3 | 3 | 0 | 4 | 0 | 5.79 |
| 37 | 31 · Branch | 3 | 3 | 0 | 4 | 0 | 5.79 |
| 38 | 34 · Branch | 3 | 3 | 0 | 4 | 0 | 5.79 |
| 39 | 37 · Branch | 3 | 3 | 0 | 4 | 0 | 5.79 |
| 40 | 40 · Four Chain | 4 | 4 | 0 | 4 | 0 | 6.5 |
| 41 | 48 · Tall Chain | 4 | 4 | 0 | 4 | 0 | 6.5 |
| 42 | 69 · Long Chain | 6 | 4 | 0 | 4 | 0 | 6.5 |
| 43 | 126 · Four Chain | 10 | 4 | 0 | 4 | 0 | 6.5 |
| 44 | 134 · Tall Chain | 10 | 4 | 0 | 4 | 0 | 6.5 |
| 45 | 55 · Long Chain | 5 | 4 | 0 | 6 | 0 | 6.79 |
| 46 | 90 · Tall Chain | 7 | 4 | 0 | 6 | 0 | 6.79 |
| 47 | 96 · Chain Link | 7 | 4 | 0 | 6 | 0 | 6.79 |
| 48 | 111 · Chain Link | 8 | 4 | 0 | 6 | 0 | 6.79 |
| 49 | 112 · Four Chain | 9 | 4 | 0 | 6 | 0 | 6.79 |
| 50 | 49 · Branch Chain | 4 | 4 | 0 | 4 | 0 | 7.5 |
| 51 | 56 · Fork Tail | 5 | 4 | 0 | 4 | 0 | 7.5 |
| 52 | 70 · Fork Tail | 6 | 4 | 0 | 4 | 0 | 7.5 |
| 53 | 91 · Branch Chain | 7 | 4 | 0 | 4 | 0 | 7.5 |
| 54 | 106 · Branch Chain | 8 | 4 | 0 | 4 | 0 | 7.5 |
| 55 | 121 · Branch Chain | 9 | 4 | 0 | 4 | 0 | 7.5 |
| 56 | 135 · Branch Chain | 10 | 4 | 0 | 4 | 0 | 7.5 |
| 57 | 42 · Fork Tail | 4 | 4 | 0 | 6 | 0 | 7.79 |
| 58 | 63 · Branch Chain | 5 | 4 | 0 | 6 | 0 | 7.79 |
| 59 | 77 · Branch Chain | 6 | 4 | 0 | 6 | 0 | 7.79 |
| 60 | 83 · Long Chain | 7 | 4 | 0 | 5 | 1 | 7.79 |
| 61 | 84 · Fork Tail | 7 | 4 | 0 | 6 | 0 | 7.79 |
| 62 | 98 · Long Chain | 8 | 4 | 0 | 5 | 1 | 7.79 |
| 63 | 99 · Fork Tail | 8 | 4 | 0 | 6 | 0 | 7.79 |
| 64 | 114 · Fork Tail | 9 | 4 | 0 | 6 | 0 | 7.79 |
| 65 | 128 · Fork Tail | 10 | 4 | 0 | 6 | 0 | 7.79 |
| 66 | 68 · Four Chain | 6 | 4 | 0 | 7 | 1 | 8 |
| 67 | 65 · Wide Fork | 5 | 4 | 0 | 4 | 0 | 8.5 |
| 68 | 86 · Three Wide | 7 | 4 | 0 | 4 | 0 | 8.5 |
| 69 | 101 · Three Wide | 8 | 4 | 0 | 4 | 0 | 8.5 |
| 70 | 116 · Three Wide | 9 | 4 | 0 | 4 | 0 | 8.5 |
| 71 | 41 · Long Chain | 4 | 4 | 0 | 8 | 2 | 8.58 |
| 72 | 76 · Tall Chain | 6 | 4 | 0 | 8 | 2 | 8.58 |
| 73 | 127 · Long Chain | 10 | 4 | 0 | 8 | 2 | 8.58 |
| 74 | 54 · Four Chain | 5 | 4 | 0 | 7 | 4 | 9.11 |
| 75 | 62 · Tall Chain | 5 | 4 | 0 | 7 | 4 | 9.11 |
| 76 | 113 · Long Chain | 9 | 4 | 0 | 7 | 4 | 9.11 |
| 77 | 82 · Four Chain | 7 | 4 | 0 | 9 | 4 | 9.32 |
| 78 | 97 · Four Chain | 8 | 4 | 0 | 9 | 4 | 9.32 |
| 79 | 105 · Tall Chain | 8 | 4 | 0 | 9 | 4 | 9.32 |
| 80 | 120 · Tall Chain | 9 | 4 | 0 | 9 | 4 | 9.32 |
| 81 | 58 · Three Wide | 5 | 4 | 0 | 5 | 1 | 9.79 |
| 82 | 93 · Wide Fork | 7 | 4 | 0 | 5 | 1 | 9.79 |
| 83 | 108 · Wide Fork | 8 | 4 | 0 | 5 | 1 | 9.79 |
| 84 | 123 · Wide Fork | 9 | 4 | 0 | 5 | 1 | 9.79 |
| 85 | 51 · Wide Fork | 4 | 4 | 0 | 6 | 1 | 10 |
| 86 | 72 · Three Wide | 6 | 4 | 0 | 6 | 1 | 10 |
| 87 | 137 · Wide Fork | 10 | 4 | 0 | 6 | 1 | 10 |
| 88 | 103 · Decoy | 8 | 5 | 1 | 5 | 0 | 10.5 |
| 89 | 125 · Decoy Mix | 9 | 5 | 1 | 5 | 0 | 10.5 |
| 90 | 139 · Decoy Mix | 10 | 5 | 1 | 5 | 0 | 10.5 |
| 91 | 44 · Three Wide | 4 | 4 | 0 | 8 | 2 | 10.58 |
| 92 | 79 · Wide Fork | 6 | 4 | 0 | 8 | 2 | 10.58 |
| 93 | 130 · Three Wide | 10 | 4 | 0 | 8 | 2 | 10.58 |
| 94 | 46 · Decoy | 4 | 5 | 1 | 8 | 0 | 10.79 |
| 95 | 47 · Decoy Deep | 4 | 5 | 1 | 6 | 1 | 10.79 |
| 96 | 60 · Decoy | 5 | 5 | 1 | 8 | 0 | 10.79 |
| 97 | 61 · Decoy Deep | 5 | 5 | 1 | 6 | 1 | 10.79 |
| 98 | 74 · Decoy | 6 | 5 | 1 | 8 | 0 | 10.79 |
| 99 | 75 · Decoy Deep | 6 | 5 | 1 | 6 | 1 | 10.79 |
| 100 | 88 · Decoy | 7 | 5 | 1 | 8 | 0 | 10.79 |
| 101 | 89 · Decoy Deep | 7 | 5 | 1 | 6 | 1 | 10.79 |
| 102 | 110 · Decoy Mix | 8 | 5 | 1 | 8 | 0 | 10.79 |
| 103 | 117 · Mixed Wide | 9 | 5 | 0 | 8 | 0 | 10.79 |
| 104 | 131 · Mixed Wide | 10 | 5 | 0 | 8 | 0 | 10.79 |
| 105 | 119 · Decoy Deep | 9 | 5 | 1 | 10 | 2 | 11.58 |
| 106 | 133 · Decoy Deep | 10 | 5 | 1 | 10 | 2 | 11.58 |
| 107 | 45 · Mixed Wide | 4 | 5 | 0 | 6 | 1 | 11.79 |
| 108 | 59 · Mixed Wide | 5 | 5 | 0 | 6 | 1 | 11.79 |
| 109 | 73 · Mixed Wide | 6 | 5 | 0 | 6 | 1 | 11.79 |
| 110 | 87 · Mixed Wide | 7 | 5 | 0 | 6 | 1 | 11.79 |
| 111 | 109 · Wide Mix | 8 | 5 | 0 | 6 | 1 | 11.79 |
| 112 | 52 · Wide Mix | 4 | 5 | 0 | 8 | 1 | 12 |
| 113 | 66 · Wide Mix | 5 | 5 | 0 | 8 | 1 | 12 |
| 114 | 80 · Wide Mix | 6 | 5 | 0 | 8 | 1 | 12 |
| 115 | 94 · Wide Mix | 7 | 5 | 0 | 8 | 1 | 12 |
| 116 | 118 · Decoy | 9 | 5 | 1 | 8 | 1 | 12 |
| 117 | 132 · Decoy | 10 | 5 | 1 | 8 | 1 | 12 |
| 118 | 50 · Grandchild | 4 | 5 | 0 | 8 | 4 | 12.11 |
| 119 | 64 · Grandchild | 5 | 5 | 0 | 8 | 4 | 12.11 |
| 120 | 78 · Grandchild | 6 | 5 | 0 | 8 | 4 | 12.11 |
| 121 | 92 · Grandchild | 7 | 5 | 0 | 8 | 4 | 12.11 |
| 122 | 104 · Decoy Deep | 8 | 5 | 1 | 9 | 4 | 12.11 |
| 123 | 53 · Decoy Mix | 4 | 5 | 1 | 11 | 2 | 12.58 |
| 124 | 67 · Decoy Mix | 5 | 5 | 1 | 11 | 2 | 12.58 |
| 125 | 81 · Decoy Mix | 6 | 5 | 1 | 11 | 2 | 12.58 |
| 126 | 95 · Decoy Mix | 7 | 5 | 1 | 11 | 2 | 12.58 |
| 127 | 100 · Deep Branch | 8 | 5 | 0 | 13 | 5 | 12.58 |
| 128 | 102 · Mixed Wide | 8 | 5 | 0 | 11 | 2 | 12.58 |
| 129 | 122 · Grandchild | 9 | 5 | 0 | 13 | 5 | 12.58 |
| 130 | 124 · Wide Mix | 9 | 5 | 0 | 11 | 2 | 12.58 |
| 131 | 136 · Grandchild | 10 | 5 | 0 | 13 | 5 | 12.58 |
| 132 | 138 · Wide Mix | 10 | 5 | 0 | 11 | 2 | 12.58 |
| 133 | 115 · Deep Branch | 9 | 5 | 0 | 14 | 9 | 13.32 |
| 134 | 129 · Deep Branch | 10 | 5 | 0 | 14 | 9 | 13.32 |
| 135 | 43 · Deep Branch | 4 | 5 | 0 | 14 | 11 | 13.58 |
| 136 | 57 · Deep Branch | 5 | 5 | 0 | 14 | 11 | 13.58 |
| 137 | 71 · Deep Branch | 6 | 5 | 0 | 14 | 11 | 13.58 |
| 138 | 85 · Deep Branch | 7 | 5 | 0 | 14 | 11 | 13.58 |
| 139 | 107 · Grandchild | 8 | 5 | 0 | 14 | 11 | 13.58 |
