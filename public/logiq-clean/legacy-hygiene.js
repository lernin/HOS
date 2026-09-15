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
    assertMatchCount(html, /\benforceMoatForSelected\b/g, 1, 'enforceMoatForSelected references');
    return removeSingleRegex(
      html,
      /[ \t]*\/\* Keyboard-only moat recenter \(call AFTER handling arrows\/J\/K\/L\/I\) \*\/\r?\n[ \t]*function enforceMoatForSelected\(\)\{[\s\S]*?[ \t]*flyCenterToUID\(selUid, \{ duration: dur \}\);\r?\n[ \t]*state\._lastMoat = now;\r?\n[ \t]*\}\r?\n[ \t]*\}\r?\n/,
      'dead enforceMoatForSelected function'
    );
  }

  function removeSupersededEarlyFlyCenterToUID(html) {
    assertMatchCount(html, /function\s+flyCenterToUID\s*\(/g, 2, 'flyCenterToUID declarations');
    return removeSingleRegex(
      html,
      /[ \t]*\/\* Smoothly pan to a node's center, preserving current zoom\. \*\/\r?\n[ \t]*function flyCenterToUID\(uid, \{ duration = CONFIG_FLY\.hotkeyDuration \} = \{\}\)\{[\s\S]*?(?=[ \t]*\/\* Center the \*current\* selection with a given duration \(no zoom\)\. \*\/)/,
      'superseded early flyCenterToUID declaration'
    );
  }

  function removeSupersededEarlyCenterOnSelected(html) {
    assertMatchCount(html, /function\s+centerOnSelected\s*\(/g, 2, 'centerOnSelected declarations');
    return removeSingleRegex(
      html,
      /[ \t]*\/\* Center the \*current\* selection with a given duration \(no zoom\)\. \*\/\r?\n[ \t]*function centerOnSelected\(\{ duration = CONFIG_FLY\.hotkeyDuration \} = \{\}\)\{[\s\S]*?[ \t]*flyCenterToUID\(uid, \{ duration \}\);\r?\n[ \t]*\}\r?\n/,
      'superseded early centerOnSelected declaration'
    );
  }

  function removeDuplicateStandaloneShiftFOwner(html) {
    // Direct RED/GREEN evidence establishes ownership: keyDispatcher's global
    // centerOnSelected handles the ordinary selectedUid path used by v161. The
    // later standalone treeManager listener can no-op because it reads a different
    // selection surface. Preserve the dispatcher and remove only this duplicate.
    assertMatchCount(
      html,
      /if\s*\(lower === 'f' && e\.shiftKey\)\s*\{\s*e\.preventDefault\(\);\s*centerOnSelected\(\);\s*return;\s*\}/g,
      1,
      'keyDispatcher Shift+F owners'
    );
    assertMatchCount(
      html,
      /if\s*\(e\.key === 'F' && e\.shiftKey\)/g,
      1,
      'standalone Shift+F owners'
    );
    return removeSingleRegex(
      html,
      /document\.addEventListener\('keydown', \(e\) => \{\r?\n[ \t]*if \(e\.key === 'F' && e\.shiftKey\) \{\r?\n[ \t]*if \(isTextField\(e\.target\) && !state\.tabHold\) return; \/\/ don't hijack typing\r?\n[ \t]*e\.preventDefault\(\);\r?\n[ \t]*treeManager\.centerOnSelected\(\);\r?\n[ \t]*\}\r?\n\}, true\);\r?\n/,
      'duplicate standalone Shift+F owner'
    );
  }

  function sanitize(html) {
    let cleaned = String(html);
    const removals = [];

    cleaned = removeMarkedBlock(cleaned, '/* [patch] shift-W wordbank to trash start */', '/* [patch] shift-W wordbank to trash end */', 'unreachable Shift+W Word Bank-to-Trash');
    removals.push('unreachable-shift-w-wordbank-trash');

    cleaned = removeSingleRegex(cleaned, /[ \t]*nEnter\.on\("dblclick", \(event,d\)=>\{ event\.stopPropagation\(\); openNodeEditor\(d\); \}\);\r?\n/, 'suppressed node dblclick editor handler');
    removals.push('suppressed-node-dblclick-editor');

    cleaned = removeSecondTabRegistration(cleaned);
    removals.push('duplicate-tab-listener-registration');

    cleaned = cleanLegacySavedMapsSurface(cleaned);
    removals.push('unreachable-local-map-save-path');
    removals.push('duplicate-trees-listener-registration');

    cleaned = removeDeadEnforceMoatForSelected(cleaned);
    removals.push('dead-enforce-moat-for-selected');

    cleaned = removeSupersededEarlyFlyCenterToUID(cleaned);
    removals.push('superseded-early-fly-center-to-uid');

    cleaned = removeSupersededEarlyCenterOnSelected(cleaned);
    removals.push('superseded-early-center-on-selected');

    cleaned = removeDuplicateStandaloneShiftFOwner(cleaned);
    removals.push('duplicate-standalone-shift-f-owner');

    return { html: cleaned, removals };
  }

  window.LOGiQLegacyHygiene = Object.freeze({ sanitize });
})();
