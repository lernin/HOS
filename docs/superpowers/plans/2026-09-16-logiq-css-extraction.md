# LOGiQ CSS Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the clean candidate's single legacy v161 inline CSS block into one external `/logiq-clean/legacy-v161.css` file without changing visual or behavioral output.

**Architecture:** Keep immutable `/logiq-v161-legacy/index.html` unchanged. The existing `legacy-hygiene.js` adapter continues its nine proven cleanup transforms, then fail-closed externalizes exactly one legacy `<style>` block into an absolute stylesheet reference. The stylesheet file is a byte-equivalent copy of the payload between the immutable v161 `<style>` and `</style>` tags.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js 22 test runner, Playwright 1.55.0, D3 7.9.0, Vite, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-logiq-css-extraction-design.md`

## Global Constraints

- Immutable `/logiq-v161-legacy/index.html` remains byte-for-byte unchanged.
- Extract only the single legacy inline `<style>` block; do not move JavaScript.
- `/logiq-clean/legacy-v161.css` contains the exact extracted CSS payload; no selector/value cleanup or reformatting.
- Do not alter card geometry, typography, wrapping, tree spacing, connector geometry, selection appearance, D3 layout, mutation behavior, Shift+F, Tab, drag behavior, persistence, or mobile behavior.
- Keep all nine existing hygiene removals unchanged.
- Extraction must fail closed if the sanitized source does not contain exactly one legacy `<style>` block.
- Do not merge or deploy production.

---

### Task 1: Establish RED CSS-ownership protection and branch CI

**Files:**
- Modify: `.github/workflows/logiq-clean-rebuild.yml`
- Modify: `tests/logiq-clean-hygiene.test.mjs`

**Interfaces:**
- Consumes: existing `open('/logiq-clean/index.html')` helper and immutable `/logiq-v161-legacy/index.html` route.
- Produces: regression contract requiring zero inline legacy style blocks, one external `/logiq-clean/legacy-v161.css` stylesheet, and exact CSS payload equality with v161.

- [ ] **Step 1: Add this branch to the existing push trigger**

Add the exact branch entry beneath the existing `rebuild/logiq-v161-clean-mobile-*` entry:

```yaml
on:
  push:
    branches:
      - 'rebuild/logiq-v161-clean-mobile-*'
      - 'rebuild/logiq-v161-css-extraction-20260915'
```

Do not change pull-request triggers, job steps, Node version, or test commands.

- [ ] **Step 2: Add the failing CSS ownership test**

Append this test to `tests/logiq-clean-hygiene.test.mjs`:

```js
test('clean runtime externalizes the exact immutable v161 legacy stylesheet', async () => {
  const { context, page } = await open('/logiq-clean/index.html')

  const state = await page.evaluate(async () => {
    const legacySource = await fetch('/logiq-v161-legacy/index.html', { cache: 'no-store' }).then((r) => r.text())
    const match = legacySource.match(/<style>([\s\S]*?)<\/style>/i)
    if (!match) throw new Error('immutable v161 legacy style block not found')

    const externalHref = '/logiq-clean/legacy-v161.css'
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => new URL(link.href).pathname)
      .filter((pathname) => pathname === externalHref)

    const extractedCss = await fetch(externalHref, { cache: 'no-store' }).then(async (r) => ({
      ok: r.ok,
      text: await r.text(),
    }))

    return {
      inlineStyleCount: document.head.querySelectorAll('style').length,
      externalStylesheetCount: links.length,
      extractedCssOk: extractedCss.ok,
      extractedCss: extractedCss.text,
      legacyCss: match[1],
    }
  })

  await context.close()

  assert.equal(state.inlineStyleCount, 0, 'clean runtime must not retain legacy inline style ownership')
  assert.equal(state.externalStylesheetCount, 1, 'clean runtime must load exactly one extracted legacy stylesheet')
  assert.equal(state.extractedCssOk, true, 'extracted legacy stylesheet must be fetchable')
  assert.equal(state.extractedCss, state.legacyCss, 'external stylesheet must exactly match immutable v161 CSS payload')
})
```

- [ ] **Step 3: Run the existing gate and verify RED fails for the intended reason**

The branch push should execute the existing workflow. The relevant harness command remains:

```bash
node --test tests/logiq-clean-parity.test.mjs tests/logiq-clean-hygiene.test.mjs tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected result: all existing parity/hygiene/keyboard tests pass; the new CSS ownership test fails because the clean runtime still has an inline `<style>` block, has no `/logiq-clean/legacy-v161.css`, or both. Do not alter runtime code until this failure is observed.

- [ ] **Step 4: Commit the RED checkpoint**

```bash
git add .github/workflows/logiq-clean-rebuild.yml tests/logiq-clean-hygiene.test.mjs
git commit -m "test: require external LOGiQ legacy stylesheet"
```

---

### Task 2: Externalize the exact legacy stylesheet

**Files:**
- Create: `public/logiq-clean/legacy-v161.css`
- Modify: `public/logiq-clean/legacy-hygiene.js`
- Test: `tests/logiq-clean-hygiene.test.mjs`

**Interfaces:**
- Consumes: sanitized v161 HTML after the existing nine hygiene removals.
- Produces: `externalizeLegacyStyle(html) -> html` that asserts one `<style>` block and replaces it with `<link rel="stylesheet" href="/logiq-clean/legacy-v161.css">`.

- [ ] **Step 1: Create the CSS file from the immutable payload without reformatting**

Use the immutable source as the only input. The extraction command is:

```bash
node - <<'NODE'
const fs = require('node:fs')
const source = fs.readFileSync('public/logiq-v161-legacy/index.html', 'utf8')
const matches = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)]
if (matches.length !== 1) throw new Error(`Expected exactly one legacy style block; found ${matches.length}`)
fs.writeFileSync('public/logiq-clean/legacy-v161.css', matches[0][1], 'utf8')
NODE
```

Then prove the new file is byte-equivalent to the immutable payload:

```bash
node - <<'NODE'
const fs = require('node:fs')
const source = fs.readFileSync('public/logiq-v161-legacy/index.html', 'utf8')
const match = source.match(/<style>([\s\S]*?)<\/style>/i)
if (!match) throw new Error('Legacy style block missing')
const css = fs.readFileSync('public/logiq-clean/legacy-v161.css', 'utf8')
if (css !== match[1]) throw new Error('Extracted CSS differs from immutable v161 payload')
NODE
```

The source audit found no `url(` references in the legacy stylesheet, so moving the exact payload to `/logiq-clean/` does not change relative CSS-asset resolution.

- [ ] **Step 2: Add fail-closed style externalization to `legacy-hygiene.js`**

Add this helper next to the other deterministic source transforms:

```js
  function externalizeLegacyStyle(html) {
    assertMatchCount(
      html,
      /<style>[\s\S]*?<\/style>/gi,
      1,
      'legacy inline style blocks'
    );

    return html.replace(
      /<style>[\s\S]*?<\/style>/i,
      '<link rel="stylesheet" href="/logiq-clean/legacy-v161.css">'
    );
  }
```

At the end of `sanitize(html)`, after `removeDuplicateStandaloneShiftFOwner(cleaned)` and after its existing removal report entry, externalize the style before returning:

```js
    cleaned = removeDuplicateStandaloneShiftFOwner(cleaned);
    removals.push('duplicate-standalone-shift-f-owner');

    cleaned = externalizeLegacyStyle(cleaned);

    return { html: cleaned, removals };
```

Do not add CSS extraction to the `removals` array; that array remains the historical hygiene-removal contract and must still contain exactly the same nine entries.

- [ ] **Step 3: Run GREEN verification locally or through the exact branch workflow**

Required commands/workflow steps:

```bash
npm run build
node --test --test-name-pattern='^(immutable legacy source|legacy inline script|legacy DOM)' tests/logiq-v161-baseline.test.mjs
npm install --no-save --package-lock=false playwright@1.55.0 d3@7.9.0
npx playwright install --with-deps chromium
npm run dev -- --port 4173
node --test tests/logiq-clean-parity.test.mjs tests/logiq-clean-hygiene.test.mjs tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected result: build passes; immutable v161 passes; all hygiene/keyboard/parity tests pass; CSS ownership test passes with exact payload equality.

- [ ] **Step 4: Commit the extraction**

```bash
git add public/logiq-clean/legacy-v161.css public/logiq-clean/legacy-hygiene.js
git commit -m "refactor: extract LOGiQ legacy stylesheet"
```

---

### Task 3: Record and verify the modularization checkpoint

**Files:**
- Modify: `docs/LOGIQ_CLEAN_REBUILD_AUDIT.md`
- GitHub workroom: HOS Issue #108

**Interfaces:**
- Consumes: exact successful code-head SHA and workflow run evidence from Task 2.
- Produces: durable checkpoint evidence and a clean handoff to the next JavaScript extraction design checkpoint.

- [ ] **Step 1: Update the audit with the first modular boundary**

Add a checkpoint section stating:

```markdown
## Modularization checkpoint 1 — legacy CSS extraction

- Immutable v161 remains unchanged.
- `/logiq-clean/legacy-v161.css` now owns the clean candidate's legacy presentation CSS.
- `legacy-hygiene.js` fail-closed replaces exactly one inline legacy `<style>` block with one absolute `/logiq-clean/legacy-v161.css` link.
- The extracted CSS payload is byte-equivalent to the immutable v161 style payload.
- The nine hygiene-removal entries remain unchanged.
- Full build, immutable-source, visual geometry, drag, keyboard, camera, hygiene, and CSS-ownership gates pass on the exact checkpoint head.
- No merge, deployment, Supabase mutation, or production-data mutation occurred.
```

Also change the audit exit status from “next checkpoint should be a separate modular-extraction design checkpoint” to state that modularization has begun and the next design checkpoint may select one small pure-JavaScript responsibility.

- [ ] **Step 2: Commit the audit update**

```bash
git add docs/LOGIQ_CLEAN_REBUILD_AUDIT.md
git commit -m "docs: record LOGiQ CSS extraction checkpoint"
```

- [ ] **Step 3: Verify the exact final documentation head**

Because the workflow includes `docs/LOGIQ_CLEAN_REBUILD*.md`, the audit commit must trigger the full parity workflow. Do not claim completion until the workflow for the exact final documentation SHA concludes `success`.

- [ ] **Step 4: Record the handoff in HOS Issue #108**

Post: goal, design decision, branch, spec path, plan path, exact final SHA, files changed, RED evidence, GREEN workflow run, production/staging impact, unresolved issues, and next smallest step. Explicitly state: no merge and no deployment.
