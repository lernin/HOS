# Ocean Estate fullscreen performance lab — design

**Date:** 2026-11-24 · **Status:** REVIEW (preview only)

## Intent
Ashley observes smooth movement in a small desktop window but unpleasant/janky navigation at 3440×1440 fullscreen on Intel UHD 630. Provide meaningful **live graphics cost controls** without changing navigation, geometry, Kuna, QR phone pairing or production.

## Options considered
1. Permanently simplify architecture/shaders: costly, visual risk, needs profiling — defer.
2. Manual rendering scale only: cheap but users must tune continually.
3. **Chosen:** manual render-resolution ceiling plus conservative automatic adaptation, live FPS and toggles for costly shadows and nonessential interior accent lights; reversible per-browser settings.

## Behavior
- Retain existing Lighter/Balanced/Detailed graphics preset.
- Add **Render resolution** 50–100% slider (percentage of the selected graphics preset pixel ratio); separate **Automatic resolution** on/off. Auto may lower actual resolution below slider ceiling down to 40% when measured FPS is low and recover slowly when fast; only adapt when scene is actively rendering and not paused/hidden. Resolution is actual `renderer.setPixelRatio`, not CSS window scaling.
- Add reversible **Sun shadows** and **Accent lights** switches (default on) to lower GPU shading passes when explicitly selected.
- Add **Show FPS** overlay (on by default for preview) including current percentage, so user can compare fullscreen/windowed. Readout should be based on *rendered* frames, not just React updates.
- Persist prefs in existing `ocean-estate-v1` localStorage with safe clamping; honor older settings. Preserve one-touch navigation and phone-remote protocol.
- No changes to Supabase (production or staging), RLS, secrets, data, schema, release process or automatic production deployment.

## Acceptance
Test auto declines after low FPS and recovers gradually with ceilings; graphics low preset remains compatible, shadows/light toggles alter actual engine properties; FPS overlay reports meaningful value while playing; check on 3440×1440 desktop in fullscreen and small window; no nausea claim without user test. Build and existing Estate tests must pass, then review **isolated interactive Vercel preview**. PR is stacked on owner-approved remote PR #328 but no merge or production deployment.
