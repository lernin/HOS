# Enchanted Matrix Sanctuary — World Labs Marble Lab experiment

**Status:** experimental / unverified, preview branch only
**Repository:** lernin/HOS (The Lab, separate from Procedia)
**Route:** /marble-sanctuary, behind existing Lab PIN
**Owning branch:** experiment/marble-sanctuary-20261105
**Database:** none. Production \`jzaghifuhinkzzhiojre\` and staging \`psfxnlrsaorrsdbadikk\` are unchanged.
**Priority:** 2/9 (significance 2 × urgency 1); launch-critical: **No**. Teacher Reading → Kuna stays the launch-critical work.

## Experience target

Children should feel that they have entered a living, healthy, joyful place of beauty. No toy-like geometric trees, clunky buildings, or cheap procedural placeholder scenes. Aim for outstanding art direction, not maximal world size. Children must be able to freely walk, look, and choose their own path. NPCs and placed objects should invite learning interactions, and their visuals should fit the sanctuary rather than resemble debug markers.

The child can walk for enjoyment without being forced through lessons. Learning is available through optional conversations and discoverable objects. No commercialization/monetization, public chat, or child-to-stranger interaction is authorized.

## What this branch actually implements

- A separate Lab route and hub card; no changes to existing 3D experiences.
- An in-browser, local-file high-resolution **textured GLB** mesh importer using the installed Three.js GLTFLoader. Imported bytes stay on the device: no upload or database writes.
- Desktop WASD + pointer-look; phone drag-look and virtual movement pad.
- Ground raycast for limited terrain following; no physics engine, robust collision/navigation mesh, jumping, or guaranteed indoor traversal yet.
- Glowing **temporary** interaction markers, a starter guide NPC, add/remove/reposition-by-placement for NPC/object markers, editable names/questions/expected exact-match sample answers. Markers store locally in the current browser via localStorage; imported GLB is **not** retained across reloads.
- Local-only dialogue prototype. It is **not** a production pedagogy assessment, does not write Historionyms/Hexonyms/Prakteonyms, and is not a connected Procedia activity.

### The important format distinction

World Labs Marble worlds export:
- **Gaussian splat .spz/.ply** for highest-fidelity appearance; integrate later using **World Labs Spark** and a collider GLB.
- **High-resolution textured mesh .glb** for the first Lab import, requiring an appropriate export entitlement.
- **Low-resolution collider .glb** for physical navigation, **not** suitable as the final visual surface.

This pilot intentionally implements only high-resolution textured GLB. Do **not** load a low-resolution collider mesh and present its clunky output as a quality evaluation of Marble. Do not claim SPZ support until actual Spark rendering and mobile testing pass. The World Labs **Marble world-generation product** is not the Marble English-prerequisite curriculum inside Procedia.

## World Labs generation brief

> A breathtaking, peaceful, emotionally restorative, highly detailed fantasy nature sanctuary for elementary-age children. Child-height, fully navigable environmental experience. An inviting woodland clearing with velvety moss, natural flowering trees, sunlit meadow plants, tiny luminous butterflies, ferns, botanically rich foliage and a gentle flowing creek. An elegant, organically shaped cozy cottage or arboreal conservatory is seamlessly integrated into the forest, with a physically clear walkable entrance. A winding continuous footpath forms an easy exploration loop with two discoveries near the water and garden. Radiant warm morning sun and softly filtered canopy light, healthy spring-green colors, iridescent flower accents, no frightening elements, no sharp glassy architecture, no monumental empty spaces. Beautiful composition from every walking viewpoint, spatially coherent scale, clear walkable surfaces and navigation, quiet joy. No people, no text, no signs, no interface elements, no floating islands unless structurally intentional. Detailed materials and sculpted natural forms, art quality comparable to a premier professionally art-directed game environment. Design for a short exploratory area first, not an enormous landscape.

**Generation check:** View it in Marble from child-eye height from several angles, including walking behind structures and approaching the doorway. Reject impossible paths, blurry/flat vegetation, warped geometry, and visually busy or unsettling artifacts. Choose a world with legible spatial layout before paying for detailed export.

## Review procedure

1. Sign into the private Lab and open **Enchanted Matrix Sanctuary**.
2. Export a *high-resolution textured mesh GLB* from a Marble-generated environment that has appropriate usage rights; import it from local device files.
3. Confirm appearance stays excellent while walking, not just in a still thumbnail.
4. On Galaxy S23 Ultra: rotate landscape, drag to look, use the left thumb pad, approach the guide, choose **Talk**, enter a sample answer, return to wandering.
5. Choose **Create**, place one new friend and one object at walkable locations, edit their prompts, press **Play**, and interact with both. Refresh to verify editable markers persist locally; GLB must be loaded again.
6. Test performance with a moderate-size GLB. Record mobile frame pacing and memory. Complex imported topology can impair raycast/collision; do not count a static build as successful phone verification.

**Acceptance requires:** a genuinely high-quality imported world, comfortable phone navigation, reliable interaction, working local edits and no regressions to the Lab PIN or existing experiences. Currently not verified.

## Next smallest steps

1. Obtain ONE genuinely beautiful Marble world export or appropriately licensed professional GLB. **No payment without Ashley's separate approval.**
2. Perform a real interactive phone preview; do not deploy automatically, because Vercel releases are paused pending approval.
3. If the original splat looks dramatically better than textured GLB, integrate World Labs Spark 2.x for SPZ and a separate collider GLB in this branch (or next focused branch). Use a pinned package/lockfile and mobile testing.
4. Only after beauty + walking are accepted, replace debug marker aesthetics with matching art assets, then connect one approved NPC interaction through Procedia's existing learning contracts rather than inventing a parallel progression engine.

## Handoff

- **Branch:** \`experiment/marble-sanctuary-20261105\`
- **Files:** \`src/experiences/MarbleSanctuary.tsx\`, \`src/experiences/marble-sanctuary.css\`, \`src/main.tsx\`, \`vercel.json\`, this document.
- **Scope untouched:** existing Lab experiences, learner DB, sign-in/PIN rules, existing Procedure routes, production deployment.
- **Checks:** Awaiting remote build and real-device interaction. No Marble account or paid export was used. No Vercel preview or production release is claimed.
