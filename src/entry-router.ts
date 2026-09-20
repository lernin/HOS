if (window.location.pathname === '/waterfall-village-v2') {
  void import('./waterfall-v2-entry')
} else if (window.location.pathname === '/engagement-lab') {
  void import('./engagement-lab-entry')
} else {
  void import('./main')
}
