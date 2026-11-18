if (window.location.pathname === '/estate-adventure') {
  void import('./estate-adventure-entry')
} else (window.location.pathname === '/town') {
  void import('./town-entry')
} else if (window.location.pathname === '/waterfall-village-v2') {
  void import('./waterfall-v2-entry')
} else if (window.location.pathname === '/phonics-swipe') {
  void import('./phonics-swipe-entry')
} else {
  void import('./main')
}
