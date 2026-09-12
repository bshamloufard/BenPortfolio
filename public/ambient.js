// Sample the existing SVG geometry once. Each frame only moves six small
// signals and their short trails; the diagrams themselves remain still.
(() => {
  // The production build injects geometry sampled by scripts/geometry.mjs.
  // Development falls back to the SVG, so editing a route still works live.
  const cachedSamples = null;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const panels = [...document.querySelectorAll('.ambient-panel')].map(element => {
    const tracks = [...element.querySelectorAll('.signal-track')].map(track => {
      const path = track.querySelector('.trace-line');
      const cached = cachedSamples?.[path.getAttribute('d')];
      const buffer = cached ? new DataView(Uint8Array.from(atob(cached), byte => byte.charCodeAt(0)).buffer) : null;
      const length = cached ? 0 : path.getTotalLength();
      const samples = Array.from({ length: 129 }, (_, index) => buffer ? { x: buffer.getFloat32(index * 8, true), y: buffer.getFloat32(index * 8 + 4, true) } : path.getPointAtLength(length * index / 128));
      return {
        element: track, path, glow: track.querySelector('.trace-glow'),
        packet: track.querySelector('.signal-packet'), samples,
        duration: Number(track.dataset.duration), delay: Number(track.dataset.delay),
        x: 0, y: 0, opacity: 0, lastOpacity: '', lastTransform: '',
      };
    });
    // Rasterize the static drawing separately from the two small signal layers.
    const original = element.querySelector('svg');
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.setAttribute('viewBox', original.getAttribute('viewBox'));
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('class', 'ambient-motion');
    overlay.append(original.querySelector('.signal-layer'));
    element.append(overlay);
    const nodes = [...element.querySelectorAll('.network-lines circle')].map(node => {
      const lamp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      lamp.setAttribute('cx', node.getAttribute('cx'));
      lamp.setAttribute('cy', node.getAttribute('cy'));
      lamp.setAttribute('r', '3');
      lamp.setAttribute('class', 'node-lamp');
      overlay.append(lamp);
      return { element: lamp, x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')), lastOpacity: '' };
    });
    return { element, tracks, nodes, visible: false, elapsed: 0 };
  });

  let frame = 0, previous = 0;
  const allowed = () => !document.hidden && !reduced.matches && !forced.matches && root.dataset.motion !== 'paused';

  function draw(panel) {
    for (const track of panel.tracks) {
      const phase = ((panel.elapsed - track.delay) % track.duration) / track.duration;
      // Signals rest briefly between journeys and fade at the edges of a route.
      const progress = Math.min(1, phase / .82);
      const opacity = Math.min(1, progress / .07, (1 - progress) / .1);
      track.opacity = opacity;
      const opacityValue = opacity.toFixed(3);
      if (opacityValue !== track.lastOpacity) {
        track.element.style.opacity = track.lastOpacity = opacityValue;
      }
      // A resting signal is fully transparent. Keep its geometry until it wakes.
      if (opacity === 0) continue;
      const index = progress * 128;
      const start = Math.min(127, Math.floor(index));
      const a = track.samples[start];
      const b = track.samples[start + 1];
      const blend = index - start;
      const x = track.x = a.x + (b.x - a.x) * blend;
      const y = track.y = a.y + (b.y - a.y) * blend;
      const offset = String(.115 - progress);
      // Keep these on the paths: inheriting them from the group forces the
      // browser to recalculate styles for every signal descendant each frame.
      track.path.style.strokeDashoffset = offset;
      track.glow.style.strokeDashoffset = offset;
      const transform = `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
      if (transform !== track.lastTransform) {
        track.packet.setAttribute('transform', track.lastTransform = transform);
      }
    }
    for (const node of panel.nodes) {
      let brightness = 0;
      for (const light of panel.tracks) {
        if (light.opacity === 0) continue;
        const distance = (light.x - node.x) ** 2 + (light.y - node.y) ** 2;
        brightness = Math.max(brightness, Math.exp(-distance / 260) * light.opacity);
      }
      const opacity = brightness.toFixed(3);
      if (opacity !== node.lastOpacity) node.element.style.opacity = node.lastOpacity = opacity;
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
