  /* ======================= LOGYQ API ======================= */
  // Mutable bag fragments register onto. Clusters should read shared
  // state and late-bound managers through `logyq` instead of hoping a
  // same-scope `const` exists. Unconverted fragments still use ambient
  // bindings; attach() keeps both views pointing at the same objects.
  const logyq = {
    config: null,
    moat: null,
    fly: null,
    camera: null,
    state: null,
    elements: null,
    utils: null,
    export: null,
    history: null,
    data: null,
    visual: null,
    detectors: null,
    layout: null,
    structure: null,
    editing: null,
    selection: null,
    treeOps: null,
    deletion: null,
    drag: null,
    wordDock: null,
    dock: null,
    input: null,
    mix: null,
    treeManager: null,
    keyboard: null,
  }

  function attach(name, value) {
    logyq[name] = value
    return value
  }

