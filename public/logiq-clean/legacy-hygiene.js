(() => {
  function countMatches(text, regex) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    return [...String(text).matchAll(new RegExp(regex.source, flags))].length;
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

  function removeSecondTabRegistration(html) {
    const pair = /[ \t]*window\.addEventListener\('keydown', tabDown, true\);\r?\n[ \t]*window\.addEventListener\('keyup', tabUp, true\);\r?\n/g;
    const matches = [...html.matchAll(pair)];
    if (matches.length !== 2) {
      throw new Error(`LOGiQ hygiene expected two identical Tab listener registrations; found ${matches.length}`);
    }
    const second = matches[1];
    return html.slice(0, second.index) + html.slice(second.index + second[0].length);
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

    return { html: cleaned, removals };
  }

  window.LOGiQLegacyHygiene = Object.freeze({ sanitize });
})();
