(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    if (!win?.LOGiQBridge) return

    try {
      win.eval(`
        (() => {
          if (window.__logiqV2AtomicBankUndo) return;
          window.__logiqV2AtomicBankUndo = true;

          const originalPushHistory = pushHistory;
          const originalAddWords = addWords;
          let pending = null;

          const clearPending = () => {
            if (pending?.timer) clearTimeout(pending.timer);
            pending = null;
          };

          pushHistory = function(action) {
            const bankDelete = action && (action.type === 'delete' || action.type === 'delete-root');
            if (!bankDelete) {
              clearPending();
              return originalPushHistory(action);
            }

            if (!pending) {
              pending = {
                actions: [],
                beforeTree: state.root ? utils.deepClone(state.root.data) : null,
                beforeBank: Array.isArray(state.wordBank) ? state.wordBank.slice() : [],
                timer: 0,
              };
            }

            originalPushHistory(action);
            pending.actions.push(action);
            if (pending.timer) clearTimeout(pending.timer);
            pending.timer = setTimeout(clearPending, 0);
          };

          addWords = function(raw, to) {
            if (to === 'bank' && pending?.actions?.length) {
              const transaction = pending;
              if (transaction.timer) clearTimeout(transaction.timer);

              while (
                transaction.actions.length &&
                state.history.length &&
                transaction.actions.includes(state.history[state.history.length - 1])
              ) {
                state.history.pop();
              }

              originalPushHistory({
                type: 'replace-root',
                prev: transaction.beforeTree,
                prevBank: transaction.beforeBank,
              });
              pending = null;
            }

            return originalAddWords(raw, to);
          };
        })();
      `)
    } catch (error) {
      console.warn('LOGiQ V2 atomic Word Bank undo patch unavailable', error)
    }
  })
})()