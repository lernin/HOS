# LOGiQ Keyboard Zoom Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Z/Shift+Z keyboard-event ownership into `/logiq-clean/keyboard-zoom.js` without exposing legacy runtime state or changing any observable behavior.

**Architecture:** Load a synchronous classic-script adapter immediately before the sanitized legacy runtime. Keep `zoomByStep` and `isTextField` private, then inject only those functions into the adapter's frozen `mount()` interface at the original listener location.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js 22 test runner, `node:vm`, Playwright 1.55.0, D3 7.9.0, Vite, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-20-logiq-keyboard-zoom-adapter-design.md`

## Global Constraints

- Immutable `/public/logiq-v161-legacy/index.html` remains byte-for-byte unchanged.
- Extract only Z/Shift+Z listener ownership; keep `ZOOM_STEP`, `zoomByStep`, D3 zoom state, and the W listener in the legacy closure.
- Do not expose `state`, `elements`, `treeManager`, D3, DOM nodes, or mutation helpers.
- Preserve listener phase, `{ passive: false }`, modifier filtering, text-field filtering, default prevention, direction mapping, and viewport-center behavior.
- Preserve the nine-entry hygiene report and exact external CSS ownership.
- Do not alter tree, selection, editing, drag, persistence, mobile interaction, Supabase runtime/map data, layout, or rendering.
- Every source transform and adapter dependency check fails closed.
- Do not weaken an existing parity/regression test.
- The only CI workflow change is the exact new branch trigger.
- Do not merge to main or deploy to production.

## Review Focus

- A repeated adapter script or second `mount()` call must fail rather than register duplicate keyboard ownership; Task 1 tests both conditions.
- Missing or incorrectly typed `target`, `zoomByStep`, or `isTextField` dependencies must throw before registration; Task 1 tests every dependency.
- Lowercase and uppercase Z, including Shift+Z, must preserve v161 direction and default-prevention behavior; Task 1 compares observed browser traces.
- Ctrl, Meta, Alt, and text-field Z input must not zoom or prevent default; Task 1 compares all exclusion paths.
- Extracting the bubble-phase Z listener must not disturb the adjacent capture-phase W listener; Task 1 structurally and behaviorally protects W.

---

### Task 1: Establish RED adapter ownership and behavior contracts

**Files:**
- Modify: `.github/workflows/logiq-clean-rebuild.yml:5-8`
- Modify: `tests/logiq-clean-keyboard-ownership.test.mjs:1-171`

**Interfaces:**
- Consumes: current `/logiq-clean/index.html`, `window.LOGiQLegacyHygiene.sanitize(html)`, immutable v161, Playwright's browser keyboard/event model.
- Produces: RED contract for `window.LOGiQKeyboardZoom.mount({ target, zoomByStep, isTextField })`, one external adapter script, zero inline Z listeners, and exact v161 behavior parity.

- [ ] **Step 1: Add the exact implementation branch to CI**

Add only this branch entry beneath the CSS extraction branch:

```yaml
on:
  push:
    branches:
      - 'rebuild/logiq-v161-clean-mobile-*'
      - 'rebuild/logiq-v161-css-extraction-20260915'
      - 'rebuild/logiq-v161-keyboard-zoom-20260916'
```

Do not change pull-request triggers, permissions, job steps, dependency versions, or commands.

- [ ] **Step 2: Extend the existing CI-owned keyboard test file**

In `tests/logiq-clean-keyboard-ownership.test.mjs`, add the `node:vm` import alongside the existing imports:

```js
import vm from 'node:vm'
```

Add these constants beneath the existing `d3Source` constant:

```js
const immutableLegacyPath = new URL('../public/logiq-v161-legacy/index.html', import.meta.url)
const adapterPath = new URL('../public/logiq-clean/keyboard-zoom.js', import.meta.url)
```

Append the following focused adapter tests after the existing Tab tests. They reuse the file's existing `open()`, browser hooks, and D3 routing:

```js

function loadAdapter() {
  const source = readFileSync(adapterPath, 'utf8')
  const sandbox = { window: {} }
  vm.runInNewContext(source, sandbox, { filename: 'keyboard-zoom.js' })
  return { adapter: sandbox.window.LOGiQKeyboardZoom, sandbox, source }
}

function eventFor(key, overrides = {}) {
  let prevented = false
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: {},
    preventDefault() { prevented = true },
    wasPrevented() { return prevented },
    ...overrides,
  }
}

test('keyboard zoom adapter validates dependencies, mounts once, and preserves key filtering', () => {
  for (const dependencies of [
    {},
    { target: { addEventListener() {} } },
    { target: { addEventListener() {} }, zoomByStep() {} },
  ]) {
    const { adapter } = loadAdapter()
    assert.throws(() => adapter.mount(dependencies), /LOGiQ keyboard zoom adapter/)
  }

  const { adapter, sandbox, source } = loadAdapter()
  assert.equal(Object.isFrozen(adapter), true)
  assert.equal(typeof adapter.mount, 'function')

  const registrations = []
  const directions = []
  let typing = false
  const target = {
    addEventListener(type, handler, options) {
      registrations.push({ type, handler, options })
    },
  }

  adapter.mount({
    target,
    zoomByStep: (direction) => directions.push(direction),
    isTextField: () => typing,
  })

  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].type, 'keydown')
  assert.equal(registrations[0].options.passive, false)

  const handler = registrations[0].handler
  const zoomIn = eventFor('z')
  handler(zoomIn)
  const zoomOut = eventFor('Z', { shiftKey: true })
  handler(zoomOut)
  assert.deepEqual(directions, [1, -1])
  assert.equal(zoomIn.wasPrevented(), true)
  assert.equal(zoomOut.wasPrevented(), true)

  for (const bypass of [
    eventFor('z', { ctrlKey: true }),
    eventFor('z', { metaKey: true }),
    eventFor('z', { altKey: true }),
    eventFor('q'),
  ]) {
    handler(bypass)
    assert.equal(bypass.wasPrevented(), false)
  }

  typing = true
  const typedZ = eventFor('z')
  handler(typedZ)
  assert.equal(typedZ.wasPrevented(), false)
  assert.deepEqual(directions, [1, -1])

  assert.throws(
    () => adapter.mount({ target, zoomByStep() {}, isTextField() { return false } }),
    /already mounted/
  )
  assert.throws(
    () => vm.runInNewContext(source, sandbox, { filename: 'keyboard-zoom.js' }),
    /namespace already exists/
  )
})

test('clean runtime gives keyboard zoom one external owner while preserving private zoom and W owners', async () => {
  const { context, page } = await open('/logiq-clean/index.html')
  const ownership = await page.evaluate(() => {
    const html = document.documentElement.innerHTML
    const adapterPathname = '/logiq-clean/keyboard-zoom.js'
    return {
      adapterScripts: Array.from(document.scripts)
        .map((script) => script.src ? new URL(script.src).pathname : '')
        .filter((pathname) => pathname === adapterPathname).length,
      namespaceFrozen: Object.isFrozen(window.LOGiQKeyboardZoom),
      mountType: typeof window.LOGiQKeyboardZoom?.mount,
      inlineZOwners: (html.match(/if\s*\(e\.key === 'z' \|\| e\.key === 'Z'\)/g) || []).length,
      mountCalls: (html.match(/LOGiQKeyboardZoom\.mount\s*\(/g) || []).length,
      zoomDefinitions: (html.match(/function\s+zoomByStep\s*\(/g) || []).length,
      inlineWOwners: (html.match(/if\s*\(e\.key === 'w' \|\| e\.key === 'W'\)/g) || []).length,
    }
  })
  await context.close()

  assert.deepEqual(ownership, {
    adapterScripts: 1,
    namespaceFrozen: true,
    mountType: 'function',
    inlineZOwners: 0,
    mountCalls: 1,
    zoomDefinitions: 1,
    inlineWOwners: 1,
  })
})

async function keyboardTrace(route) {
  const { context, page } = await open(route)
  await page.waitForTimeout(650)
  const trace = await page.evaluate(() => {
    const canvas = document.getElementById('canvas')
    const round = (value) => Number(Number(value).toFixed(6))
    const transform = () => {
      const current = d3.zoomTransform(canvas)
      return { x: round(current.x), y: round(current.y), k: round(current.k) }
    }
    const dispatch = (init, target = document.body) => {
      const before = transform()
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      })
      target.dispatchEvent(event)
      return { before, after: transform(), defaultPrevented: event.defaultPrevented }
    }

    const z = dispatch({ key: 'z' })
    const shiftZ = dispatch({ key: 'Z', shiftKey: true })
    const ctrlZ = dispatch({ key: 'z', ctrlKey: true })
    const metaZ = dispatch({ key: 'z', metaKey: true })
    const altZ = dispatch({ key: 'z', altKey: true })
    const inputZ = dispatch({ key: 'z' }, document.getElementById('wordInput'))
    const dockBefore = document.getElementById('Dock').className
    const w = dispatch({ key: 'w' })
    const dockAfter = document.getElementById('Dock').className

    return { z, shiftZ, ctrlZ, metaZ, altZ, inputZ, dockBefore, dockAfter, w }
  })
  await context.close()
  return trace
}

test('keyboard zoom and adjacent W behavior match immutable v161', async () => {
  const legacy = await keyboardTrace('/logiq-v161-legacy/index.html')
  const clean = await keyboardTrace('/logiq-clean/index.html')

  assert.deepEqual(clean, legacy)
  assert.ok(clean.z.after.k > clean.z.before.k, 'Z must zoom in')
  assert.ok(clean.shiftZ.after.k < clean.shiftZ.before.k, 'Shift+Z must zoom out')
  assert.equal(clean.z.defaultPrevented, true)
  assert.equal(clean.shiftZ.defaultPrevented, true)

  for (const name of ['ctrlZ', 'metaZ', 'altZ', 'inputZ']) {
    assert.deepEqual(clean[name].after, clean[name].before, `${name} must not zoom`)
    assert.equal(clean[name].defaultPrevented, false, `${name} must not prevent default`)
  }

  assert.notEqual(clean.dockAfter, clean.dockBefore, 'plain W must still move the Word Dock')
})

test('sanitizer rejects zero or duplicate zoom listeners and runtime anchors', async () => {
  const source = readFileSync(immutableLegacyPath, 'utf8')
  const listenerPattern = /window\.addEventListener\('keydown', \(e\) => \{\r?\n[ \t]*\/\/ Don.t hijack Undo\/Redo or when typing in inputs[\s\S]*?zoomByStep\(e\.shiftKey \? -1 : \+1\);\r?\n[ \t]*\}\r?\n[ \t]*\}, \{ passive: false \}\);\r?\n/
  const listener = source.match(listenerPattern)?.[0]
  assert.ok(listener, 'immutable v161 keyboard zoom listener must exist')

  const anchors = [...source.matchAll(/<script>(\r?\n)\(\(\) => \{/g)]
  assert.equal(anchors.length, 1, 'immutable v161 must have one main runtime anchor')
  const anchor = anchors[0][0]
  const newline = anchors[0][1]

  const cases = [
    [source.replace(listener, ''), /expected 1 Z\/Shift\+Z keyboard listeners; found 0/],
    [source.replace(listener, `${listener}${listener}`), /expected 1 Z\/Shift\+Z keyboard listeners; found 2/],
    [source.replace(anchor, `<script>${newline}/* anchor drift */${newline}(() => {`), /expected 1 legacy runtime script anchors; found 0/],
    [source.replace(anchor, `${anchor}${newline}${anchor}`), /expected 1 legacy runtime script anchors; found 2/],
  ]

  const { context, page } = await open('/logiq-clean/index.html')
  try {
    for (const [input, expected] of cases) {
      await assert.rejects(
        page.evaluate((html) => window.LOGiQLegacyHygiene.sanitize(html), input),
        { message: expected }
      )
    }
  } finally {
    await context.close()
  }
})
```

- [ ] **Step 3: Run the focused ownership test and observe the intended RED**

Start the existing Vite server on port 4173, then run:

```bash
node --test --test-name-pattern='clean runtime gives keyboard zoom one external owner' tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected: FAIL because `adapterScripts` is `0`, `mountType` is `undefined`, and `inlineZOwners` is `1`.

- [ ] **Step 4: Run the adapter and sanitizer guards and confirm their intended RED reasons**

```bash
node --test --test-name-pattern='keyboard zoom adapter validates|sanitizer rejects zero' tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected: the adapter test fails because `public/logiq-clean/keyboard-zoom.js` does not exist; the sanitizer test fails because the current sanitizer does not reject the modified Z-listener/runtime-anchor shapes.

- [ ] **Step 5: Confirm the behavioral test is already GREEN against current inline ownership**

```bash
node --test --test-name-pattern='keyboard zoom and adjacent W behavior match' tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected: PASS. This records the observable v161 behavior that Task 2 must preserve.

- [ ] **Step 6: Commit the RED contract**

```bash
git add .github/workflows/logiq-clean-rebuild.yml tests/logiq-clean-keyboard-ownership.test.mjs
git commit -m "test: require external LOGiQ keyboard zoom adapter"
```

---

### Task 2: Externalize keyboard zoom ownership through dependency injection

**Files:**
- Create: `public/logiq-clean/keyboard-zoom.js`
- Modify: `public/logiq-clean/legacy-hygiene.js:1-190`
- Test: `tests/logiq-clean-keyboard-ownership.test.mjs`

**Interfaces:**
- Consumes: private `zoomByStep(direction)` and `isTextField(element)` functions supplied by the transformed legacy closure.
- Produces: frozen `window.LOGiQKeyboardZoom.mount({ target, zoomByStep, isTextField })`, exactly one external script reference, exactly one mount call, and no inline Z listener.

- [ ] **Step 1: Create the external adapter with validation and duplicate-owner guards**

Create `public/logiq-clean/keyboard-zoom.js`:

```js
(() => {
  if (window.LOGiQKeyboardZoom) {
    throw new Error('LOGiQ keyboard zoom adapter namespace already exists');
  }

  let mounted = false;

  function mount({ target, zoomByStep, isTextField } = {}) {
    if (!target || typeof target.addEventListener !== 'function') {
      throw new TypeError('LOGiQ keyboard zoom adapter requires an event target');
    }
    if (typeof zoomByStep !== 'function') {
      throw new TypeError('LOGiQ keyboard zoom adapter requires zoomByStep');
    }
    if (typeof isTextField !== 'function') {
      throw new TypeError('LOGiQ keyboard zoom adapter requires isTextField');
    }
    if (mounted) {
      throw new Error('LOGiQ keyboard zoom adapter is already mounted');
    }

    target.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextField(event.target)) return;

      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        zoomByStep(event.shiftKey ? -1 : +1);
      }
    }, { passive: false });

    mounted = true;
  }

  window.LOGiQKeyboardZoom = Object.freeze({ mount });
})();
```

- [ ] **Step 2: Add the exact fail-closed source transform**

In `public/logiq-clean/legacy-hygiene.js`, add this regex and helper before `sanitize()`:

```js
  const keyboardZoomListenerPattern = /window\.addEventListener\('keydown', \(e\) => \{\r?\n[ \t]*\/\/ Don.t hijack Undo\/Redo or when typing in inputs\r?\n[ \t]*if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;\r?\n[ \t]*if \(isTextField\(e\.target\)\) return;\r?\n\r?\n[ \t]*\/\/ Z = zoom in, Shift\+Z = zoom out\r?\n[ \t]*if \(e\.key === 'z' \|\| e\.key === 'Z'\) \{\r?\n[ \t]*e\.preventDefault\(\);\r?\n[ \t]*zoomByStep\(e\.shiftKey \? -1 : \+1\);\r?\n[ \t]*\}\r?\n[ \t]*\}, \{ passive: false \}\);\r?\n/;

  function externalizeKeyboardZoom(html) {
    assertMatchCount(
      html,
      keyboardZoomListenerPattern,
      1,
      'Z/Shift+Z keyboard listeners'
    );
    assertMatchCount(
      html,
      /<script>\r?\n\(\(\) => \{/g,
      1,
      'legacy runtime script anchors'
    );

    const mountCall = [
      'window.LOGiQKeyboardZoom.mount({',
      '  target: window,',
      '  zoomByStep,',
      '  isTextField,',
      '});',
      '',
    ].join('\n');

    const withoutInlineOwner = html.replace(keyboardZoomListenerPattern, mountCall);
    return withoutInlineOwner.replace(
      /<script>(\r?\n)\(\(\) => \{/,
      (_match, newline) => (
        `<script src="/logiq-clean/keyboard-zoom.js"></script>${newline}`
        + `<script>${newline}(() => {`
      )
    );
  }
```

In `sanitize(html)`, invoke the transform after the ninth hygiene removal and before CSS externalization:

```js
    cleaned = removeDuplicateStandaloneShiftFOwner(cleaned);
    removals.push('duplicate-standalone-shift-f-owner');

    cleaned = externalizeKeyboardZoom(cleaned);
    cleaned = externalizeLegacyStyle(cleaned);
```

Do not add an entry to `removals`.

- [ ] **Step 3: Run the focused adapter suite and verify GREEN**

With Vite still serving port 4173:

```bash
node --test tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected: every existing keyboard test and all four new adapter tests PASS. Verify specifically that namespace collision, duplicate mount, every dependency error, structural ownership, v161 behavior parity, and all four malformed source cases pass.

- [ ] **Step 4: Run the complete local LOGiQ gate**

```bash
npm run build
node --test --test-name-pattern='^(immutable legacy source|legacy inline script|legacy DOM)' tests/logiq-v161-baseline.test.mjs
node --test tests/logiq-clean-parity.test.mjs tests/logiq-clean-hygiene.test.mjs tests/logiq-clean-keyboard-ownership.test.mjs
```

Expected: build passes, immutable verification passes, and every parity/hygiene/keyboard/visual/drag/CSS/adapter test passes.

- [ ] **Step 5: Verify scope and immutable ownership before committing**

```bash
git diff --check
git diff --name-only
git hash-object public/logiq-v161-legacy/index.html
git diff -- public/logiq-v161-legacy/index.html
```

Expected: the immutable diff is empty and its blob remains `94ad599f24e84a6629072cc98557ea3842a915d1`. Product changes are limited to the adapter and hygiene transform; Task 1's tests/workflow are already committed.

- [ ] **Step 6: Commit the extraction**

```bash
git add public/logiq-clean/keyboard-zoom.js public/logiq-clean/legacy-hygiene.js
git commit -m "refactor: extract LOGiQ keyboard zoom adapter"
```

---

### Task 3: Review, verify, and record the checkpoint

**Files:**
- Modify: `docs/LOGIQ_CLEAN_REBUILD_AUDIT.md`
- GitHub workroom: HOS Issue #108

**Interfaces:**
- Consumes: reviewed Task 1 and Task 2 commits, exact test output, immutable blob, exact GitHub Actions run.
- Produces: durable checkpoint evidence, exact final branch SHA, and an explicit stop before any further extraction.

- [ ] **Step 1: Run the Superpowers final whole-branch review**

Use a fresh reviewer against the complete branch diff from the CSS checkpoint. Review for behavior drift, duplicate ownership, unsafe global exposure, insufficient fail-closed matching, test weaknesses, and unauthorized scope.

If findings exist, apply `superpowers:receiving-code-review`, fix them through RED/GREEN where applicable, and request re-review. Do not proceed with unresolved findings.

- [ ] **Step 2: Capture the exact reviewed code head and immutable evidence**

```bash
git rev-parse HEAD
git rev-parse HEAD^{tree}
git hash-object public/logiq-v161-legacy/index.html
git status --short --branch
```

Record the exact 40-character code HEAD and tree printed here. The status must be clean and the immutable blob must be `94ad599f24e84a6629072cc98557ea3842a915d1`.

- [ ] **Step 3: Append the verified checkpoint to the audit**

Append a section titled exactly:

```markdown
## Modularization checkpoint 2 — keyboard zoom adapter
```

The section must state, using the exact observed values from Steps 1-2:

- Z/Shift+Z keyboard-event ownership moved to `/logiq-clean/keyboard-zoom.js`.
- `zoomByStep`, `isTextField`, D3 zoom state, runtime state, DOM references, and the W listener remain private in the transformed legacy closure.
- The adapter receives only `target`, `zoomByStep`, and `isTextField`; the namespace is frozen and duplicate mounting fails closed.
- RED ownership and malformed-source failures were observed before implementation.
- The complete build, immutable, parity, hygiene, CSS, keyboard, visual, drag, and adapter gate passed on the exact reviewed code HEAD.
- Immutable v161 retained blob `94ad599f24e84a6629072cc98557ea3842a915d1`.
- Supabase inventory was read-only; no Supabase data/schema mutation occurred.
- No main merge or production deployment occurred.
- No next JavaScript extraction was started.

- [ ] **Step 4: Commit the audit and rerun the exact final-head gate**

```bash
git add docs/LOGIQ_CLEAN_REBUILD_AUDIT.md
git commit -m "docs: record LOGiQ keyboard zoom checkpoint"
npm run build
node --test --test-name-pattern='^(immutable legacy source|legacy inline script|legacy DOM)' tests/logiq-v161-baseline.test.mjs
node --test tests/logiq-clean-parity.test.mjs tests/logiq-clean-hygiene.test.mjs tests/logiq-clean-keyboard-ownership.test.mjs
git status --short --branch
git rev-parse HEAD
```

Expected: every command passes, status is clean, and the printed SHA is the exact final documentation head.

- [ ] **Step 5: Publish only the implementation branch and verify exact-head CI**

Push `rebuild/logiq-v161-keyboard-zoom-20260916`, then verify the `LOGiQ clean rebuild parity` workflow for the exact SHA printed in Step 4. The conclusion must be `success`; success on an earlier SHA is insufficient.

Do not merge, promote, or deploy production. A Vercel preview may be published only under the owner's existing preview authorization and must be recorded separately from production.

- [ ] **Step 6: Record the final evidence in HOS Issue #108**

Post one evidence comment containing:

- goal and approved dependency-injection decision;
- branch and exact final HEAD SHA;
- spec and plan paths;
- files changed and ownership moved;
- intended RED results;
- local GREEN counts and commands;
- exact successful GitHub Actions run URL and SHA;
- review findings and their resolutions, or an explicit statement that the final reviewer found none;
- immutable v161 blob confirmation;
- confirmation of read-only Supabase use;
- confirmation that nothing was merged or deployed to production;
- explicit stop before the next extraction.

- [ ] **Step 7: Report completion without beginning another boundary**

Report what moved, RED and GREEN evidence, exact final SHA, review outcome, immutable confirmation, deployment status, and the safest candidate for the next separately approved checkpoint. Do not implement that candidate.
