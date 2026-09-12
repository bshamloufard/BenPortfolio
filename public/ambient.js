// Sample the existing SVG geometry once. Each frame only moves six small
// signals and their short trails; the diagrams themselves remain still.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const panels = [...document.querySelectorAll('.ambient-panel')].map(element => {
    const tracks = [...element.querySelectorAll('.signal-track')].map(track => {
      const path = track.querySelector('.trace-line');
      const length = path.getTotalLength();
      const samples = Array.from({ length: 129 }, (_, index) => path.getPointAtLength(length * index / 128));
      return {
        element: track, path, glow: track.querySelector('.trace-glow'),
        packet: track.querySelector('.signal-packet'), samples,
        duration: Number(track.dataset.duration), delay: Number(track.dataset.delay),
      };
    });
    const nodes = [...element.querySelectorAll('.network-lines circle')].map(node => {
      const lamp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      lamp.setAttribute('cx', node.getAttribute('cx'));
      lamp.setAttribute('cy', node.getAttribute('cy'));
      lamp.setAttribute('r', '3');
      lamp.setAttribute('class', 'node-lamp');
      element.querySelector('svg').append(lamp);
      return { element: lamp, x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')) };
    });
    return { element, tracks, nodes, visible: false, elapsed: 0 };
  });

  let frame = 0, previous = 0;
  const allowed = () => !document.hidden && !reduced.matches && !forced.matches && root.dataset.motion !== 'paused';

  function draw(panel) {
    const lights = [];
    for (const track of panel.tracks) {
      const phase = ((panel.elapsed - track.delay) % track.duration) / track.duration;
      // Signals rest briefly between journeys and fade at the edges of a route.
      const progress = Math.min(1, phase / .82);
      const opacity = Math.min(1, progress / .07, (1 - progress) / .1);
      const index = progress * 128;
      const a = track.samples[Math.min(127, Math.floor(index))];
      const b = track.samples[Math.min(128, Math.floor(index) + 1)];
      const blend = index - Math.min(127, Math.floor(index));
      const x = a.x + (b.x - a.x) * blend;
      const y = a.y + (b.y - a.y) * blend;
      const offset = String(.115 - progress);
      track.path.style.strokeDashoffset = offset;
      track.glow.style.strokeDashoffset = offset;
      track.element.style.opacity = opacity.toFixed(3);
      track.packet.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      lights.push({ x, y, opacity });
    }
    for (const node of panel.nodes) {
      let brightness = 0;
      for (const light of lights) {
        const distance = (light.x - node.x) ** 2 + (light.y - node.y) ** 2;
        brightness = Math.max(brightness, Math.exp(-distance / 260) * light.opacity);
      }
      node.element.style.opacity = brightness.toFixed(3);
    }
  }

  function tick(now) {
    frame = 0;
    if (!allowed()) return;
    const delta = previous ? Math.min(now - previous, 64) : 0;
    previous = now;
    for (const panel of panels) {
      if (!panel.visible) continue;
      panel.elapsed += delta;
      draw(panel);
    }
    if (panels.some(panel => panel.visible)) frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    for (const panel of panels) panel.element.dataset.motion = allowed() && panel.visible ? 'playing' : 'still';
    if (allowed() && panels.some(panel => panel.visible)) frame = requestAnimationFrame(tick);
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) panels.find(panel => panel.element === entry.target).visible = entry.isIntersecting;
    sync();
  });
  for (const panel of panels) {
    draw(panel);
    observer.observe(panel.element);
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  for (const media of [reduced, forced]) media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
})();
