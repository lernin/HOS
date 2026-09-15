(() => {
  function countMatches(text, regex) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    return [...String(text).matchAll(new RegExp(regex.source, flags))].length;
  }

  function assertMatchCount(text, regex, expected, label) {
    const count = countMatches(text, regex);
    if (count !== expected) {
      throw new Error(`LOGiQ hygiene expected ${expected} ${label}; found ${count}`);
    }
  }

  function removeMarkedBlock(html, startMarker, endMarker, label) {
    const starts = html.split(startMarker).length - 1;
    const ends = html.split(endMarker).length - 1;
    if (starts !== 1 || ends !== 1) {
      throw new Error(`LOGiQ hygiene expected exactly one ${label} block; found ${starts}/${ends}`);
    }
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start) + endMarker.length;
    return html.slice(0, start) + html.slice(end);
  }

  function removeSingleRegex(html, regex, label) {
    const count = countMatches(html, regex);
    if (count !== 1) throw new Error(`LOGiQ hygiene expected exactly one ${label}; found ${count}`);
    return html.replace(regex, '');
  }

  function removeAllRegex(html, regex, expectedCount, label) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const globalRegex = new RegExp(regex.source, flags);
    const count = countMatches(html, globalRegex);
    if (count !== expectedCount) {
      throw new Error(`LOGiQ hygiene expected ${expectedCount} ${label}; found ${count}`);
    }
    return html.replace(globalRegex, '');
  }

  function removeSecondTabRegistration(html) {
    const pair = /[ \t]*window\.addEventListener\('keydown', tabDown, true\);\r?\n[ \t]*window\.addEventListener\('keyup', tabUp, true\);\r?\n/g;
    const matches = [...html.matchAll(pair)];
    if (matches.length !== 2) {
      throw new Error(`LOGiQ hygiene expected two identical Tab listener registrations; found ${matches.length}`);
    }
    const second = matches[1];
    return html.slice(0, second.index) + html.slice(second.index + second[0].length);
  }

  function removeUnusedSavedMapsSurface(html) {
    // The recovered v161 source contains a localStorage maps implementation, but no
    // save/maps controls exist in the DOM. Its only call sites are two guarded pairs
    // wired to null element references, so the entire surface is unreachable.
    assertMatchCount(html, /\bsaveCurrentMap\b/g, 3, 'saveCurrentMap references');
    assertMatchCount(html, /\bopenMapsMenu\b/g, 3, 'openMapsMenu references');
    assertMatchCount(html, /\bid\s*=\s*["']saveBtn["']/gi, 0, 'saveBtn DOM ids');
    assertMatchCount(html, /\bid\s*=\s*["']mapsBtn["']/gi, 0, 'mapsBtn DOM ids');

    let cleaned = removeMarkedBlock(
      html,
      '/* [patch] saved-refs start */',
      '/* [patch] saved-refs end */',
      'unused saved-map element refs'
    );

    cleaned = removeSingleRegex(
      cleaned,
      /[ \t]*\/\* \[patch\] saved-maps start \*\/[\s\S]*?(?=function onNodeRightButtonDown\(event, d\)\{)/,
      'unused savedMaps_v1 runtime'
    );

    cleaned = removeAllRegex(
      cleaned,
      /[ \t]*elements\.saveBtn && elements\.saveBtn\.addEventListener\("click", saveCurrentMap\);\r?\n[ \t]*elements\.mapsBtn && elements\.mapsBtn\.addEventListener\("click", openMapsMenu\);\r?\n/g,
      2,
      'guarded saved-map listener pairs'
    );

    return cleaned;
  }

  function sanitize(html) {
    let cleaned = String(html);
    const removals = [];

    // Unreachable: keyDispatcher handles every W/Shift+W earlier and returns.
    cleaned = removeMarkedBlock(
      cleaned,
      '/* [patch] shift-W wordbank to trash start */',
      '/* [patch] shift-W wordbank to trash end */',
      'unreachable Shift+W Word Bank-to-Trash'
    );
    removals.push('unreachable-shift-w-wordbank-trash');

    // Unreachable: the SVG capture listener stops dblclick before node target handlers run.
    cleaned = removeSingleRegex(
      cleaned,
      /[ \t]*nEnter\.on\("dblclick", \(event,d\)=>\{ event\.stopPropagation\(\); openNodeEditor\(d\); \}\);\r?\n/,
      'suppressed node dblclick editor handler'
    );
    removals.push('suppressed-node-dblclick-editor');

    // No-op duplicate: addEventListener ignores a second registration with the same
    // type, callback, and capture flag. Keep the first registration only.
    cleaned = removeSecondTabRegistration(cleaned);
    removals.push('duplicate-tab-listener-registration');

    // Unreachable legacy local-map implementation: its two expected DOM hooks do not
    // exist, and the only function references are those null-guarded listener pairs.
    cleaned = removeUnusedSavedMapsSurface(cleaned);
    removals.push('unused-savedmaps-v1-surface');

    return { html: cleaned, removals };
  }

  window.LOGiQLegacyHygiene = Object.freeze({ sanitize });
})();
