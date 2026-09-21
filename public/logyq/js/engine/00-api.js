  /* ======================= LOGYQ API ======================= */
  // Mutable bag fragments register onto. Clusters should read shared
  // state and late-bound managers through `logyq` instead of hoping a
  // same-scope `const` exists. Unconverted fragments still use ambient
  // bindings; attach() keeps both views pointing at the same objects.
  const logyq = {
    config: null,
    moat: null,
    fly: null,
    state: null,
    elements: null,
    utils: null,
    export: null,
    history: null,
    data: null,
    visual: null,
    detectors: null,
    editing: null,
    selection: null,
    treeOps: null,
    drag: null,
    treeManager: null,
    keyboard: null,
  }

  function attach(name, value) {
    logyq[name] = value
    return value
  }

