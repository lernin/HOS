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
