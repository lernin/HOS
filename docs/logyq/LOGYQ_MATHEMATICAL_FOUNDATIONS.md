# LOGYQ: A Mathematical Model of Colored Tree-Fitting Puzzles

**Status:** Canonical reconciliation paper  
**Date:** 2026-10-02  
**Scope:** Mathematical game model, puzzle equivalence, uniqueness, enumeration, generation, validation, and known limits.

## Abstract

LOGYQ is a finite constraint puzzle built from oriented rectangular cards whose colored boundary regions must agree when cards occupy adjacent positions in a rooted ordered tree. A puzzle is not defined by a hidden target tree. It is defined by a **bag of physical pieces plus the public contact rules**. The intended solution is therefore emergent: a puzzle is valid only when the pieces admit exactly one complete legal assembly under the stated rules.

This paper reconciles the strongest ideas developed across the LOGYQ prototype, the N=2 canonical construction, the later exhaustive solver/audit, the production puzzle catalog, and subsequent game work. It distinguishes three things that must not be conflated: (1) the abstract ordered-tree grammar currently implemented by the game; (2) the visible rectangular geometry used to draw the tree; and (3) the stronger future physical model in which every actual rectangle-to-rectangle contact, including possible cousin contacts, is mechanically significant.

Under the current parent/child and adjacent-sibling contact grammar, exhaustive enumeration gives 15 unique two-piece bags, 103 unique three-piece bags (99 chains, 4 branches), and 624 unique four-piece bags (502 chains, 122 branches), modulo global color renaming. A curated N=4 policy retains 221 of those. A production audit of 529 catalog rows found 14 with at least two complete assemblies under the current grammar; those rows were reversibly retired, leaving 515 active. These counts are evidence about the current grammar, not yet a certificate for arbitrary geometric rectangle layouts.

## 1. The central idea

The essential LOGYQ object is not a picture to be copied. It is a **constraint system**.

A player receives a finite multiset of distinct physical cards. Each card has a fixed orientation and a visible face pattern. Cards may be placed into a rooted ordered tree. Whenever the placement grammar says two cards touch, the touching boundary signatures must match. A completed puzzle uses every required card exactly once, forms one rooted tree, and satisfies every required contact.

The strongest design principle is:

> **The bag determines the answer. The stored answer does not determine correctness.**

A stored solution tree may be useful for authoring, rendering, testing, or explanation, but it is not a hidden correctness rule. If the same bag can form two different legal complete assemblies, the puzzle is ambiguous even if one of those assemblies was marked “intended.”

## 2. Primitive objects

### 2.1 Physical cards

Let a puzzle contain a finite set of physical card identities

[
P = \{p_1,p_2,\ldots,p_n\}.
]

Physical identity matters. Two cards may have identical visible faces and are still two distinct pieces.

Each card has a fixed orientation. Rotation is not permitted in the present game.

### 2.2 Face geometries

The established face grammar contains four geometric families:

1. **Whole** — one color over the entire card.
2. **Layer Cake** — two horizontal regions.
3. **Diagonal Left** — two regions separated by one diagonal orientation.
4. **Diagonal Right** — two regions separated by the opposite diagonal orientation.

For enumeration, the established candidate universe used four whole faces and 36 split faces whose two regions have different identities. The exact palette labels are conventional; what matters is equality and inequality of boundary signatures.

### 2.3 Boundary signatures

Each oriented card exposes signatures on its relevant boundaries. Abstractly write

[
\sigma_T(p),\;\sigma_B(p),\;\sigma_L(p),\;\sigma_R(p)
]

for top, bottom, left, and right boundary signatures.

A signature may be a single color or an ordered color profile induced by a split face. Two contacting boundaries are compatible when their signatures agree under the game's contact rule.

## 3. Assemblies as ordered rooted trees

A complete assembly is an **ordered rooted tree** whose vertices are the physical cards.

“Ordered” matters because siblings have visible left-to-right positions. Therefore exchanging two siblings creates another candidate assembly. If both orders are legal, the bag is not uniquely solvable.

For a rooted ordered tree T:

- a parent-child edge induces a vertical contact;
- consecutive siblings induce a horizontal contact.

Under the current game grammar:

[
\text{parent-bottom} \leftrightarrow \text{child-top}
]

and for adjacent siblings

[
\text{left-sibling-right} \leftrightarrow \text{right-sibling-left}.
]

Every such contact must match. No additional hidden color inequality, intended topology, or authored sibling order is allowed to rescue an otherwise ambiguous bag.

## 4. Legal completion and uniqueness

For a bag P, let (mathcal{T}(P)) be the set of all ordered rooted trees on the distinct physical identities in P.

Define L(T)=1 exactly when every required contact in T matches, and 0 otherwise. Then

[
\mathcal{S}(P)=\{T\in\mathcal{T}(P):L(T)=1\}
]

and the solution count is

[
N(P)=|\mathcal{S}(P)|.
]

A LOGYQ bag is impossible if N(P)=0, uniquely solvable if N(P)=1, and ambiguous if N(P)≥2.

For validation, the solver need not count beyond two. It may saturate at two because the certification question is zero, one, or more than one.

## 5. Equivalence: what counts as the same puzzle?

### 5.1 Global color renaming

If every occurrence of each color is consistently renamed, equality relationships and reasoning structure are unchanged. Enumeration therefore quotients by **global palette permutation**. With four palette identities, canonicalization considers all 24 global permutations and chooses one representative.

### 5.2 Physical identities remain distinct

Color equivalence does not collapse separate physical cards. Two identical-looking cards remain two distinct pieces during exhaustive assembly testing.

### 5.3 Orientation is structural

Diagonal Left and Diagonal Right remain distinct because rotation is forbidden.

### 5.4 Sibling order is not a quotient symmetry

Left-right sibling exchange is deliberately not factored away. If both orders work, that is genuine ambiguity.

## 6. Exhaustive enumeration

The solver enumerates ordered rooted trees over distinct physical IDs and evaluates all required contacts. A memoized ordered-forest recurrence constructs possible child sequences while preserving physical identity. Under the current grammar, external constraints can be summarized sufficiently for this recurrence; the solver retains at most two witnesses when only uniqueness is being tested.

Candidate bags are canonicalized under global color renaming before being counted as distinct puzzle types.

### 6.1 Verified small-N counts

| Piece count | Unique bags | Chains | Branches |
|---:|---:|---:|---:|
| 2 | 15 | 15 | 0 |
| 3 | 103 | 99 | 4 |
| 4 | 624 | 502 | 122 |

For N=4, curriculum/catalog policy retained 99 chains plus all 122 branches, or 221 puzzles.

An earlier provisional N=3 claim of 117 total / 8 branches was explicitly withdrawn after the uniqueness definition was strengthened. The exhaustive 103 / 4 result supersedes it.

## 7. Why N=2 has 15 canonical cases

The first complete curriculum used four fixed card geometries in ordered parent/child roles. There are 4×4=16 ordered geometry pairs. The Whole/Whole case is ambiguous under the canonical color construction, leaving 15 accepted two-card puzzles.

The N=2 curriculum also establishes that the loose card may belong below the starting card or above it as a new root. Tree construction is therefore not merely “keep adding downward.”

## 8. Branching and sibling constraints

At N=3, branching becomes possible. A parent with two children creates three relevant relations under the present grammar: parent-left child, parent-right child, and left-child/right-child sibling contact.

The sibling edge is essential. Without it, many forks are underconstrained. Sibling order must also be exhaustive: a branch whose children can swap while preserving all contacts has two assemblies and is invalid as a unique puzzle.

## 9. Cousins and the geometric frontier

The current solver's most important limitation concerns **cousins**.

In the abstract seat grammar, contact is determined by parent-child and adjacent-sibling relationships. Cousins do not automatically create a constraint. But the rendered layout can place rectangles from neighboring subtrees physically close together. If literal rectangle contact is intended to matter, those contacts must enter the mathematics.

Two models are therefore distinct:

### Model A — seat grammar

Contacts are exactly those declared by tree relationships. Cousin proximity is incidental. This is the model currently certified by exhaustive enumeration and the production audit.

### Model B — mechanical rectangle grammar

Every contact follows from actual rectangle coordinates and boundaries. If cousins physically touch, their boundary signatures must match.

Model B is stronger and requires a deterministic coordinate/layout specification. Current enumeration counts are Model A counts until Model B is implemented and re-enumerated.

## 10. What a full geometric certificate requires

Define a deterministic layout function

[
\Lambda(T) \rightarrow \{(x_i,y_i,w_i,h_i)\}_{i=1}^{n}.
]

Then derive contacts from rectangle geometry rather than ancestry labels. For every pair of cards, determine whether they share a nonzero boundary segment and which signature portions meet.

Let L_G(T)=1 exactly when every actual geometric contact is compatible. Then

[
\mathcal{S}_G(P)=\{T:L_G(T)=1\}.
]

A mechanically certified puzzle requires

[
|\mathcal{S}_G(P)|=1.
]

If cousin contacts exist, subtree memoization may require richer exposed-contour state; the subtree can no longer necessarily be summarized by root edges alone.

## 11. Production catalog audit

The production catalog in Supabase project `jzaghifuhinkzzhiojre` was audited under the current seat grammar.

| N | Audited | One solution | Retired ambiguous |
|---:|---:|---:|---:|
| 2 | 15 | 15 | 0 |
| 3 | 103 | 103 | 0 |
| 4 | 221 | 221 | 0 |
| 5 | 100 | 94 | 6 |
| 6 | 35 | 31 | 4 |
| 7 | 25 | 22 | 3 |
| 8 | 15 | 14 | 1 |
| 9 | 10 | 10 | 0 |
| 10 | 5 | 5 | 0 |
| **Total** | **529** | **515** | **14** |

The 14 ambiguous rows were soft-retired rather than deleted, with ambiguity witnesses retained in audit metadata. This is the preferred evidence model: catalog validity should be reproducible from solver evidence, not inferred from an intended solution or legacy count field.

## 12. Puzzle generation

A robust generator works from the rules outward:

1. choose piece count n;
2. generate candidate physical bags from the face universe;
3. canonicalize under global color permutation;
4. enumerate complete legal assemblies;
5. reject zero-solution bags;
6. reject bags with two or more solutions;
7. retain uniquely solvable bags;
8. compute structural/difficulty features;
9. apply curriculum policy;
10. independently shuffle presentation order so the bank does not leak solution traversal.

Drawing a desired tree can seed candidates, but it cannot certify uniqueness. The resulting bag must be tested against all assemblies permitted by the grammar.

## 13. Difficulty is not piece count

Later assessment showed that nominal tier and N alone are weak measures of reasoning difficulty. Relevant features include required additions, branching, locally accepted alternatives, misleading accepted moves, false-path depth, decoys, starting-anchor choice, equivalent/repeated bags, cousin interactions if adopted, and loose-piece presentation order.

A provisional design heuristic used:

[
D=2A+B+\log_2(1+M)+\tfrac12\log_2(1+V),
]

where A is required additions, B excess child branching, M misleading accepted additions, and V maximum available accepted additions.

This is a design estimate, not a psychological law. Child play data should calibrate or replace it. The durable conclusion is that **difficulty belongs to the presented search space, not simply the number of pieces**.

## 14. Correctness during play

The same mathematical rule should govern generation, audit, and interaction.

A placement is acceptable only when the resulting board obeys the public contact rules. Completion occurs when all required cards are present, they form one rooted ordered tree, and all required contacts match.

The game should not consult an invisible authored target topology to decide whether the child is correct.

Ideally:

[
\text{player rule}=\text{solver rule}=\text{catalog rule}.
]

## 15. Reproducibility and witnesses

For every accepted puzzle, retain enough information to reproduce the claim: physical identities, face geometries, region identities, grammar version, validation version, canonical bag key, and a legal assembly witness.

For an ambiguous puzzle, retain at least two distinct legal witnesses. “Ambiguous” then becomes inspectable evidence rather than an assertion.

The existing audit also checked the optimized solver against an independent three-piece ordered-tree oracle on 216 test bags.

## 16. Theorem, policy, and presentation must remain separate

### Mathematical layer
Solvability, uniqueness, contact grammar, and equivalence.

### Curriculum layer
Which valid puzzles to retain, when branching/decoys appear, and how repetition is controlled. The reduction from 624 valid N=4 bags to 221 retained puzzles is policy, not mathematics.

### Presentation layer
Starting card, bank order, tutorials, camera, animations, sounds, and completion effects. Presentation can change difficulty but must not redefine correctness.

## 17. Open mathematical questions

1. Decide whether the final contact ontology is seat-defined or literal rectangle contact.
2. If geometric, specify deterministic layout Λ(T).
3. Formalize cousin contact.
4. Re-enumerate N=2 onward under the stronger grammar.
5. Compare optimized recurrence with brute-force geometric oracles for tractable N.
6. Calibrate difficulty with observed child play.

These refinements should not block the existing child-facing game. The present grammar is coherent and already supports a large validated catalog.

## 18. Canonical design principles

1. **No hidden answer rule.** Correctness follows from pieces and public constraints.
2. **Exhaustive uniqueness.** Every topology/permutation allowed by the grammar counts.
3. **Sibling swaps count.** Left-right order is physical.
4. **Color names are arbitrary.** Global recoloring does not create a new reasoning puzzle.
5. **Physical pieces remain distinct.**
6. **Orientation is fixed.**
7. **Generation and validation share one grammar.**
8. **Ambiguity requires witnesses and reversible retirement.**
9. **Catalog validity and curriculum usefulness are separate judgments.**
10. **Current uniqueness claims are seat-grammar claims until geometric contact is formally specified.**

## 19. Conclusion

LOGYQ is a family of finite constraint-satisfaction problems over colored, oriented physical pieces arranged as ordered rooted trees.

Its mathematical identity comes from a powerful inversion: **the solution is discovered from the bag rather than imposed by an authored target.** Uniqueness is therefore a property to prove, not a label to assign.

The current system has a rigorous working core: explicit boundary signatures, fixed orientation, ordered-tree enumeration, global-color canonicalization, exhaustive uniqueness testing, ambiguity witnesses, and verified small-N counts. The next mathematical frontier is to replace seat-implied contact with deterministic rectangle geometry if literal physical touching—including cousin contact—is intended to be part of the game.

Until then, the 15 / 103 / 624 enumeration and the 515-active production catalog should be described precisely as **unique under the current parent/child plus adjacent-sibling contact grammar**.

---

## Reconciled provenance

This paper consolidates and supersedes scattered mathematical explanations from:

- HOS PR #131 — first chain/branch fitting prototype;
- HOS PR #135 — canonical N=2 construction and strengthened uniqueness rule;
- branch `cursor/unique-logyq-solutions-e914` — unique-puzzle generation lineage;
- HOS PR #144 — exhaustive solver, production audit, and fit/uniqueness report;
- `docs/logyq/2026-10-01-fit-and-audit.md`;
- `docs/logyq/2026-10-01-difficulty-assessment.md`;
- `scripts/audit-logyq-puzzles.mjs`;
- `tests/logyq-solver.test.mjs`;
- production `public.logiq_puzzles` and `public.logiq_curriculum_plan`;
- subsequent uniquely-solvable challenge-level work.

The historical `lernin/logiq` and `lernin/dragmap` repositories were also checked; their current default branches contain only README stubs and no additional mathematical paper to reconcile.

Older provisional counts or rules that conflict with this paper are historical evidence, not current canon.
