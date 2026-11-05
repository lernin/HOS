# LOGYQ Word-Tree Curriculum Philosophy

**Status:** Canonical working philosophy  
**Date:** 2026-10-07  
**Scope:** Semantic word-tree level design, progression, Lexonym resolution, translation lookup, validation, and curriculum data.

## 1. Purpose

The LOGYQ Word Curriculum teaches a learner to reason about relationships among meanings by building trees. It shares the physical interaction language of LOGYQ, but the correctness rule is semantic rather than color-fitting.

The curriculum is not a sequence of arbitrary vocabulary diagrams. Each level should isolate a small, teachable semantic decision, then progressively combine already-learned decisions into richer structures.

The core design principle is:

> **The meaning graph determines correctness; the authored level determines what is being taught.**

An authored target tree is useful as a lesson plan and as a compact expected arrangement, but it must not turn a semantically true relation into “wrong” merely because the author drew a different but valid route. Conversely, a broad relation may be true but insufficient when a more specific available concept belongs between the two nodes.

Example:

- with only **animal** and **dog**, animal → dog is acceptable;
- with **animal**, **mammal**, and **dog** available, animal → dog is true but insufficient;
- mammal → animal is wrong.

This is the semantic analogue of the physical game's strongest rule: correctness should come from the public domain rules, not an invisible answer sheet.

## 2. Reconciled source philosophy

This philosophy consolidates the strongest existing LOGYQ curriculum ideas rather than inventing a separate system.

From the physical game:

1. **Difficulty is not piece count.** The presented search space matters more than N alone.
2. **Curriculum policy is separate from correctness.** A valid puzzle may still be a poor lesson.
3. **Presentation affects difficulty.** Starting state, bank order, hints, and visible alternatives matter.
4. **Introduce one new reasoning demand at a time.**
5. **Measured learner performance should eventually calibrate hand-authored difficulty.**
6. **Do not force repetition loops after an imperfect solve.** A fresh problem can provide better evidence than repeating the same one.
7. **Keep identifiers stable.** Curriculum revisions should not silently destroy progress history.

These principles come from:
- `docs/logyq/LOGYQ_MATHEMATICAL_FOUNDATIONS.md`;
- `docs/logyq/2026-10-01-difficulty-assessment.md`;
- `docs/logyq/LOGYQ_ADAPTIVE_LEARNER_V1.md`;
- production `public.logiq_curriculum_plan`.

## 3. Three layers that must remain separate

### 3.1 Semantic truth

This answers: **is this relationship true?**

For taxonomy, the canonical relation is direct hypernym / hyponym:

- dog **is a** mammal;
- mammal **is an** animal.

Other relation families may later be taught, for example:

- whole → part;
- place → contained place;
- collection → member.

A level must state which relation family it is teaching. Do not silently mix relation families and pretend every parent-child edge means the same thing.

### 3.2 Curriculum sufficiency

This answers: **is this the best available placement for this lesson?**

If a relation is true through an ancestor but a more specific valid parent is also present in the lesson, the broad placement is **insufficient**, not false.

This gives three check states:

- **green / correct** — most specific valid available relationship;
- **amber / insufficient** — semantically true, but a more specific available parent exists;
- **red / wrong** — semantic relationship is false for the intended relation family.

### 3.3 Presentation

This answers: **what does the learner actually see and manipulate?**

Presentation includes:
- starting node(s);
- loose Word Bank cards;
- bank order;
- whether the new concept begins above, below, or beside an existing concept;
- hints and ghost targets;
- Check timing;
- translation lookup;
- camera and card sizing.

Presentation may make a level easier or harder, but it must not redefine semantic truth.

## 4. Lexonym identity is mandatory

Every curriculum word card must resolve to a **specific reusable Lexonym identity**, not merely a spelling string.

For this curriculum, a word Lexonym is operationally represented by:

`Atomonym + identity-bearing inflection`

with the surface Semonym carried for display.

Production already has the canonical Lexonym definition:

> An identifiable unit of language in a particular meaningful form.

The broader canonical model is Semonym + Atomonym + grammatical/orthographic state. For ordinary uninflected curriculum nouns, the required identity-bearing state is the English Inflection Code **X — Uninflected**.

This matters because a surface string can have several meanings:

- **dog** can mean the animal, a person, a fireplace support, or the verb “pursue”;
- **plant** can mean a living organism, a factory, a planted object, or several verbs;
- **car** can mean an automobile, railroad car, elevator car, etc.

A curriculum card must therefore never be stored as just `"dog"`. It needs the intended Atomonym and inflection.

## 5. Translation follows meaning, not spelling

Translation lookup must start from the card's resolved Lexonym/Atomonym, not from the English surface string.

Desired long-term path:

`English Lexonym → Atomonym / meaning identity → target-language Lexonym → target-language Semonym`

That prevents wrong translations for polysemous words.

Example: the animal sense of **dog** should resolve to Korean **개**, while another sense of “dog” must not inherit that translation merely because the English spelling matches.

Production currently contains English Atomonyms only, so the first curriculum implementation may store a **curated Korean display translation** alongside the resolved English Atomonym as presentation metadata. That is a temporary bridge, not the final multilingual ontology. When Korean Lexonyms/Atomonyms are populated, the UI should resolve the translation through those canonical identities and retire the redundant display cache.

## 6. Level-building philosophy

### 6.1 Teach the operation before complexity

The learner should first understand the spatial operation:

1. place one concept **below** a broader concept;
2. repeat below enough times that the motor/visual rule is obvious;
3. introduce placing a broader concept **above**;
4. repeat above;
5. mix above and below;
6. build a three-node chain;
7. build a four-node chain;
8. only then introduce **siblings**;
9. then combine chain + branch;
10. only later add larger trees, distractors, or mixed relation families.

The current child-facing sequence already embodies this logic and should be preserved as the opening spine.

### 6.2 One novelty at a time

A level should ideally introduce only one major new burden:

- new direction;
- new depth;
- first sibling;
- first wider branch;
- first ambiguous surface word;
- first distractor;
- first second relation family.

Do not introduce a new spatial operation, new semantic relation family, and several unfamiliar words in the same level unless the level is intentionally advanced.

### 6.3 Repetition should vary content, not merely repeat the same answer

Early repetition is useful, but use different concepts so the learner practices the rule rather than memorizing one layout.

Example:
- fruit → apple;
- fruit → banana;
- animal → dog.

All teach the same downward relation while changing lexical content.

### 6.4 Prefer familiar words while teaching tree reasoning

At the beginning, tree reasoning is the target, not obscure vocabulary. Use high-frequency, concrete terms whose senses can be resolved confidently.

Vocabulary difficulty can later become an independent difficulty dimension.

### 6.5 Do not reward semantic shortcuts when the specific bridge is present

If **animal**, **mammal**, and **dog** are all available, direct animal → dog should be amber. The learner is expected to use the strongest available semantic structure.

This is not pedantry; it teaches hierarchical precision.

### 6.6 Avoid relation-family contamination

A taxonomy level should not casually include edges like:

- body → arm (whole/part);
- Earth → Korea (location/containment);
- school → classroom (containment/function);
- home → kitchen (containment).

Those can become excellent later curricula, but they need a declared relation family and appropriate checker semantics.

The first production word-tree curriculum should therefore prioritize **taxonomy / is-a** levels. Existing mixed-relation demo maps may remain available as experiments but should not silently define the canonical progression.

## 7. Difficulty model

Word-tree difficulty should be estimated from several independent dimensions.

### Structural dimensions
- placed-card count;
- required additions;
- maximum depth;
- branching width;
- number of sibling decisions;
- number of valid ancestor shortcuts;
- number of possible placements visible at each move.

### Semantic dimensions
- familiarity of each Lexonym;
- polysemy / number of plausible senses for the surface word;
- semantic distance between adjacent concepts;
- abstractness;
- whether a missing intermediate concept must be inferred;
- relation-family novelty.

### Presentation dimensions
- starting tree;
- number of loose cards;
- Word Bank order;
- whether the required move is above/below/sibling;
- hint state;
- whether distractors are present.

A provisional curriculum difficulty score can combine these features, but it is a design estimate. As with the physical game, observed learner data should eventually calibrate the weights.

## 8. Difficulty bands

The canonical opening progression is:

### Band 0 — orientation
One relationship, one loose card. Three below examples.

### Band 1 — inverse direction
One relationship, one loose card. Introduce and repeat above.

### Band 2 — mixed direction
Single relationship; above or below is no longer predictable.

### Band 3 — short chains
Three nodes, no branching.

### Band 4 — deeper chains
Four nodes, no branching.

### Band 5 — first siblings
Three nodes with one parent and two children.

### Band 6 — branch + chain
Four to six nodes; one branch and one deeper path.

### Band 7 — precision
Include an ancestor shortcut that is semantically true but insufficient when the intermediate node is available.

### Band 8 — wider/deeper taxonomy
Larger familiar semantic trees, still one relation family.

### Band 9 — controlled ambiguity
Polysemous surfaces or semantically close alternatives, always with resolved Lexonyms.

### Band 10 — new relation families
Introduce whole/part, location, membership, or other Opsonym-backed families one at a time with explicit teaching.

Piece/card count alone must never determine the band.

## 9. Level acceptance rules

A level is ready for the child-facing curriculum only if all of the following hold:

1. Every visible word resolves to a specific Atomonym.
2. Every word has an explicit identity-bearing inflection state.
3. Every edge has a declared semantic relation family.
4. The intended relationships are semantically defensible.
5. Any ancestor shortcut behavior is known.
6. The level introduces no accidental relation-family mixture.
7. The starting state and Word Bank produce the intended reasoning demand.
8. A Korean display translation is available for the selected sense if translation lookup is enabled.
9. The level has a stable key and sequence position.
10. The level is marked curated/active separately from merely existing in the catalog.

A level may exist in the catalog without being active in the progression.

## 10. Data model

The word curriculum should be database-driven, like the physical-game catalog.

A level needs stable metadata:
- stable level key;
- sequence/band;
- title;
- relation family;
- pedagogical focus;
- difficulty features and score;
- active/curated status;
- start configuration;
- target semantic structure.

Each node needs:
- stable node key;
- parent;
- sibling order;
- displayed surface;
- Atomonym ID;
- English Inflection Code Eclogonym ID;
- derived Lexonym key/spec;
- optional curated Korean display translation;
- whether it begins on the board or in the Word Bank.

Do **not** create anonymous word strings in the level JSON when a canonical Atomonym is available.

## 11. Translation interaction

The learner should be able to inspect a word without leaving the puzzle.

Recommended child-facing behavior:
- tap/press a card without dragging, or use a small info affordance;
- show the Korean translation for the card's **resolved sense**;
- optionally show a very short English meaning clue;
- close automatically or on tap;
- translation lookup never changes placement or counts as a move.

Translation is support, not an answer leak about tree position.

For advanced/adaptive play, translation use can be recorded as support evidence, similar to a hint, without penalizing the learner by default.

## 12. Adaptive evidence

When Curriculum is integrated with the existing LOGYQ learner evidence model, record:
- level key;
- relation family;
- difficulty band/score;
- checks;
- green/amber/red counts;
- moves/rearrangements;
- translation lookups;
- hints;
- elapsed time;
- solved/abandoned.

This lets later curriculum selection answer questions such as:
- Does the learner understand taxonomy but struggle with inverse placement?
- Do they overuse broad ancestors?
- Are failures actually vocabulary failures?
- Does translation support remove the difficulty?

## 13. Catalog-growth strategy

Do not aim for “hundreds” first. Aim for a **clean generative spine**.

Phase A:
- migrate the current opening pedagogy into database-backed levels;
- resolve every Lexonym;
- restrict canonical active levels to clean taxonomy;
- add enough variants to make each band reusable.

Phase B:
- expand with curated WordNet/Procedia semantic families;
- use Bathmonym/frequency information to prefer familiar terms;
- create multiple content variants per structural pattern;
- validate that the same surface word always carries the intended Atomonym.

Phase C:
- introduce additional Opsonym relation families one at a time;
- add relation-specific tutorials and checker rules.

Phase D:
- use learner evidence to reorder or generate the next appropriate level.

## 14. Canonical principles

1. **Meaning first.** Strings are display surfaces; semantic identity is canonical.
2. **Every card has a Lexonym identity.**
3. **Translation is sense-specific.**
4. **One new reasoning demand at a time.**
5. **Difficulty is multidimensional, not card count.**
6. **Semantic truth, curriculum sufficiency, and presentation are separate layers.**
7. **True-but-broad is amber when a more specific available parent exists.**
8. **Relation families must be explicit.**
9. **Catalog existence does not imply curriculum inclusion.**
10. **Learner evidence should eventually calibrate the progression.**
11. **Stable IDs preserve history while the curriculum evolves.**
12. **The database, not hard-coded frontend arrays, should become the canonical level source.**

## 15. Immediate implementation boundary

For the first production-backed version:

- canonical relation family: taxonomy / hypernym;
- word language: English;
- default inflection: X — Uninflected;
- each card stores a resolved Atomonym;
- Korean translation is a curated presentation cache tied to that resolved sense;
- current opening below/above/chain/sibling pedagogy is retained;
- mixed-relation demo trees remain non-canonical until their relation families are explicitly supported.

This gives LOGYQ a clean semantic foundation now without blocking the later multilingual Lexonym system.
