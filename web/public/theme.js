// Toggle handler only — the initial theme (from localStorage or
// prefers-color-scheme) is set by the inline blocking script in <head>,
// before this file even loads, so there's no flash of the wrong theme.
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var root = document.documentElement;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('plated-theme', next);
    } catch (e) {}
  });
});
