# Woodland Musical World — handoff

Status: preview branch only. Do not merge or publish to production without Ashley's explicit approval.

Branch: `feature/woodland-musical-world-20260905`
PR: #39

## Goal

Replace Woodland's previous synthesized/harmony-palette background music with an adaptive musical world while preserving the recorded forest/nature ambience.

## Implemented

- Ten emotional colors: Hearth, Wonder, Calling, Adventure, Guide, Mystery, Vastness, Peril, Homeward, Triumph.
- Ten temporary physical signposts distributed around the main Woodland loop. Reaching a sign changes the current emotional color.
- Sampled orchestral renderer using VSCO 2 Community Edition CC0 violin section, viola section, cello section, French horn and flute.
- Six compatible melody families for every color.
- Melody Lab at `/melody-lab`: audition candidates with orchestral accompaniment; rate 0–3; favorites rise to the top.
- Melody ratings are local-device data. Woodland selects the highest-ranked candidate for each mood.
- Old Woodland oscillator score and harmony-palette UI removed.
- Existing forest-bird ambience retained separately.
- Existing Music Lab and Music Lab II remain separate experiments.

## Deliberately unchanged

No Supabase/database, auth, API, production data, production deployment, or Procedia main-repository changes.

## Verification

- Source changes are committed.
- Local npm/build could not be run because the execution container cannot resolve GitHub to clone the repository.
- Vercel preview build is the next executable verification gate.
- Real-phone musical quality, sample loading, transitions, sign placement, and performance remain unverified until the preview succeeds.

## Test path after preview

1. Open `/melody-lab`.
2. Choose each emotional color and audition all six candidates.
3. Give 0–3 ratings; verify favorites re-rank.
4. Open `/woodland-walk`.
5. Confirm birds/nature remain.
6. Walk the main trail and verify named physical signposts.
7. Approach each sign and verify the displayed/current mood changes and the orchestral score changes.
8. Return to a previously rated mood and verify Woodland uses that mood's highest-ranked melody.
9. Check phone landscape performance and sample-loading failures.

## Next

Ashley listens and ranks melodies. Use those ratings as evidence for the next composition/orchestration pass rather than adding more speculative musical features.
