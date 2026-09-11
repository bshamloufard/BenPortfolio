// Apply a saved preference before paint. System mode is driven entirely by CSS.
try {
  const theme = localStorage.getItem('ben-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (localStorage.getItem('ben-motion') === 'paused') document.documentElement.dataset.motion = 'paused';
} catch { /* Preferences remain usable when storage is unavailable. */ }
