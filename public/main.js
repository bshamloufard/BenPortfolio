const root = document.documentElement;
root.classList.add('enhanced');
const theme = document.querySelector('#theme');
const motion = document.querySelector('#motion-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

theme.value = root.dataset.theme || 'system';
theme.addEventListener('change', () => {
  if (theme.value === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme.value;
  try { localStorage.setItem('ben-theme', theme.value); } catch { /* Optional persistence. */ }
});

function updateMotion() {
  const paused = root.dataset.motion === 'paused' || reducedMotion.matches;
  const label = reducedMotion.matches ? 'Animation off: reduced motion preference' : paused ? 'Resume background animation' : 'Pause background animation';
  motion.setAttribute('aria-label', label);
  motion.setAttribute('aria-pressed', String(paused));
  motion.title = label;
  motion.disabled = reducedMotion.matches;
  motion.querySelector('use').setAttribute('href', paused ? '#play' : '#pause');
}
motion.addEventListener('click', () => {
  const paused = root.dataset.motion !== 'paused';
  if (paused) root.dataset.motion = 'paused';
  else delete root.dataset.motion;
  try { localStorage.setItem('ben-motion', paused ? 'paused' : 'playing'); } catch { /* Optional persistence. */ }
  updateMotion();
});
reducedMotion.addEventListener('change', updateMotion);
updateMotion();

// Keep in-page company links useful even when their details are collapsed.
function openLinkedEntry() {
  const entry = document.getElementById(location.hash.slice(1));
  if (entry instanceof HTMLDetailsElement) entry.open = true;
}
addEventListener('hashchange', openLinkedEntry);
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', () => {
    const entry = document.getElementById(link.getAttribute('href').slice(1));
    if (entry instanceof HTMLDetailsElement) entry.open = true;
  });
});
openLinkedEntry();

// Suspend decorative animation while this page is in the background.
document.addEventListener('visibilitychange', () => {
  document.querySelector('.ambient').style.display = document.hidden ? 'none' : '';
});
