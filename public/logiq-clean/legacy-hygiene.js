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

  function removeSecondMatch(html, regex, label) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const globalRegex = new RegExp(regex.source, flags);
    const matches = [...html.matchAll(globalRegex)];
    if (matches.length !== 2) {
      throw new Error(`LOGiQ hygiene expected two ${label}; found ${matches.length}`);
    }
    const second = matches[1];
    return html.slice(0, second.index) + html.slice(second.index + second[0].length);
  }

  function removeSecondTabRegistration(html) {
    return removeSecondMatch(
      html,
      /[ \t]*window\.addEventListener\('keydown', tabDown, true\);\r?\n[ \t]*window\.addEventListener\('keyup', tabUp, true\);\r?\n/g,
      'identical Tab listener registrations'
    );
  }

  function cleanLegacySavedMapsSurface(html) {
    // The Trees button is real and remains active: it can load/delete historical
    // savedMaps_v1 data. The Save button, however, does not exist in the DOM, so
    // saveCurrentMap and its two guarded listener registrations are unreachable.
    // openMapsMenu has two identical click registrations; keep exactly one.
    assertMatchCount(html, /\bsaveCurrentMap\b/g, 3, 'saveCurrentMap references');
    assertMatchCount(html, /\bopenMapsMenu\b/g, 3, 'openMapsMenu references');
    assertMatchCount(html, /\bid\s*=\s*["']saveBtn["']/gi, 0, 'saveBtn DOM ids');
    assertMatchCount(html, /\bid\s*=\s*["']mapsBtn["']/gi, 1, 'mapsBtn DOM ids');

    let cleaned = removeSingleRegex(
      html,
      /[ \t]*saveBtn:\s*document\.getElementById\("saveBtn"\),\r?\n/,
      'unused saveBtn element ref'
    );

    cleaned = removeSingleRegex(
      cleaned,
      /[ \t]*function saveCurrentMap\(\)\{[\s\S]*?(?=[ \t]*function openMapsMenu\(\)\{)/,
      'unreachable saveCurrentMap function'
    );

    cleaned = removeAllRegex(
      cleaned,
      /[ \t]*elements\.saveBtn && elements\.saveBtn\.addEventListener\("click", saveCurrentMap\);\r?\n/g,
      2,
      'guarded saveCurrentMap listener registrations'
    );

    cleaned = removeSecondMatch(
      cleaned,
      /[ \t]*elements\.mapsBtn && elements\.mapsBtn\.addEventListener\("click", openMapsMenu\);\r?\n/g,
      'identical Trees button listener registrations'
    );

    return cleaned;
  }

  function removeDeadEnforceMoatForSelected(html) {
    // Verified dead in inventory batch v161-camera-moat-001: the exact symbol name
    // occurs once (its declaration), is not exported, and has no call site.
    assertMatchCount(html, /\benforceMoatForSelected\b/g, 1, 'enforceMoatForSelected references');
    return removeSingleRegex(
      html,
      /[ \t]*\/\* Keyboard-only moat recenter \(call AFTER handling arrows\/J\/K\/L\/I\) \*\/\r?\n[ \t]*function enforceMoatForSelected\(\)\{[\s\S]*?[ \t]*flyCenterToUID\(selUid, \{ duration: dur \}\);\r?\n[ \t]*state\._lastMoat = now;\r?\n[ \t]*\}\r?\n[ \t]*\}\r?\n/,
      'dead enforceMoatForSelected function'
    );
  }

  function removeSupersededEarlyFlyCenterToUID(html) {
    // Inventory batch v161-camera-moat-001 proved that two same-scope declarations
    // exist and the later declaration is the active binding. Remove only the earlier
    // CONFIG_FLY version, leaving the active unified camera helper untouched.
    assertMatchCount(html, /function\s+flyCenterToUID\s*\(/g, 2, 'flyCenterToUID declarations');
    return removeSingleRegex(
      html,
      /[ \t]*\/\* Smoothly pan to a node's center, preserving current zoom\. \*\/\r?\n[ \t]*function flyCenterToUID\(uid, \{ duration = CONFIG_FLY\.hotkeyDuration \} = \{\}\)\{[\s\S]*?(?=[ \t]*\/\* Center the \*current\* selection with a given duration \(no zoom\)\. \*\/)/,
      'superseded early flyCenterToUID declaration'
    );
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

    // Preserve the active Trees menu, but remove its unreachable Save half and the
    // duplicate Trees click registration.
    cleaned = cleanLegacySavedMapsSurface(cleaned);
    removals.push('unreachable-local-map-save-path');
    removals.push('duplicate-trees-listener-registration');

    // Dead helper: inventory and exact-name source audit prove there is no caller.
    cleaned = removeDeadEnforceMoatForSelected(cleaned);
    removals.push('dead-enforce-moat-for-selected');

    // Same-scope duplicate: the later declaration is the binding used at runtime.
    cleaned = removeSupersededEarlyFlyCenterToUID(cleaned);
    removals.push('superseded-early-fly-center-to-uid');

    return { html: cleaned, removals };
  }

  window.LOGiQLegacyHygiene = Object.freeze({ sanitize });
})();
