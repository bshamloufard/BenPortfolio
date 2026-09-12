// An analytic trefoil, woven from closed filaments. One draw call, no textures.
// Geometry and light share a 96-second period so the loop has no reset seam.
(() => {
  const host = document.querySelector('.sculpture');
  const canvas = host.querySelector('canvas');
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const finePointer = matchMedia('(pointer: fine)');
  host.dataset.renderer = 'fallback';
  host.dataset.motion = 'still';
  let gl;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch { return; }
  if (!gl) return; // The small SVG underneath remains available without WebGL.

  const vertexSource = `
    precision highp float;
    attribute vec3 a_ribbon;
    uniform float u_phase;
    uniform vec2 u_pointer;
    uniform vec2 u_resolution;
    uniform float u_stroke;
    varying float v_edge;
    varying float v_depth;
    varying float v_light;

    vec3 filament(float t, float f) {
      float r = 1.64 + .47 * cos(3.0 * t);
      float dr = -1.41 * sin(3.0 * t);
      vec3 p = vec3(r * cos(2.0*t), r * sin(2.0*t), .64 * sin(3.0*t));
      vec3 tangent = normalize(vec3(dr*cos(2.0*t)-2.0*r*sin(2.0*t), dr*sin(2.0*t)+2.0*r*cos(2.0*t), 1.92*cos(3.0*t)));
      vec3 normal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
      vec3 binormal = cross(tangent, normal);
      float twist = f + t + .28 * sin(3.0*t - u_phase);
      float radius = .27 + .045 * sin(3.0*t + u_phase);
      p += radius * (normal * cos(twist) + binormal * sin(twist));
      float pitch = .78 + .13*sin(u_phase) + u_pointer.y;
      p.yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch)) * p.yz;
      float yaw = u_phase + .38 + u_pointer.x;
      p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
      float roll = -.28 + .12 * sin(u_phase);
      p.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * p.xy;
      return p;
    }
    vec2 project(vec3 p) {
      return p.xy * (6.8 / (6.8 - p.z)) * .345;
    }
    void main() {
      float t = a_ribbon.x;
      vec3 p = filament(t, a_ribbon.y);
      vec2 q = project(p);
      vec2 tangent = normalize(project(filament(t + .003, a_ribbon.y)) - project(filament(t - .003, a_ribbon.y)));
      vec2 edge = vec2(-tangent.y, tangent.x) * a_ribbon.z * u_stroke * 2.0 / u_resolution;
      gl_Position = vec4(q + edge, 0.0, 1.0);
      v_edge = a_ribbon.z;
      v_depth = clamp((p.z + 2.5) / 5.0, 0.0, 1.0);
      v_light = pow(.5 + .5*cos(3.0*t - 2.0*u_phase + .3*sin(a_ribbon.y)), 10.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 u_color;
    uniform float u_opacity;
    varying float v_edge;
    varying float v_depth;
    varying float v_light;
    void main() {
      float coverage = 1.0 - smoothstep(.25, 1.0, abs(v_edge));
      float depth = .18 + .65 * pow(v_depth, 1.6);
      float alpha = coverage * (depth + .24*v_light) * u_opacity;
      gl_FragColor = vec4(u_color, alpha);
    }
  `;

  let program, buffer, uniforms, count = 0, frame = 0, lastTime = 0, elapsed = 0;
  let visible = true, lost = false, bounds;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const cycle = 96_000;
  const running = () => visible && !document.hidden && !reduced.matches && !forced.matches && root.dataset.motion !== 'paused' && !lost;

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error('Filament shader unavailable');
    }
    return result;
  }

  function setup() {
    try {
      const vertex = shader(gl.VERTEX_SHADER, vertexSource);
      const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Filament program unavailable');
      gl.useProgram(program);
      uniforms = Object.fromEntries(['phase', 'pointer', 'resolution', 'stroke', 'color', 'opacity'].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const attribute = gl.getAttribLocation(program, 'a_ribbon');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      lost = false;
      resize();
      host.dataset.renderer = 'webgl';
      sync();
    } catch {
      lost = true;
      host.dataset.renderer = 'fallback';
      sync();
    }
  }

  function resize() {
    if (lost || !program) return;
    bounds = host.getBoundingClientRect();
    const compact = bounds.width < 300;
    const ratio = Math.min(devicePixelRatio || 1, compact ? 1.5 : 2);
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.stroke, .7 * ratio);
    const strands = compact ? 36 : 56;
    const steps = compact ? 192 : 256;
    const vertices = [];
    for (let strand = 0; strand < strands; strand++) {
      const f = strand / strands * Math.PI * 2;
      // Degenerate triangles join all ribbons into one triangle strip.
      if (strand) vertices.push(Math.PI * 2, (strand - 1) / strands * Math.PI * 2, 1, 0, f, -1);
      for (let step = 0; step <= steps; step++) {
        const t = step / steps * Math.PI * 2;
        vertices.push(t, f, -1, t, f, 1);
      }
    }
    count = vertices.length / 3;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    colors();
  }

  function colors() {
    if (lost || !uniforms) return;
    const style = getComputedStyle(host);
    const rgb = style.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    gl.uniform3f(uniforms.color, ...rgb.map(value => value / 255));
    gl.uniform1f(uniforms.opacity, Number(style.getPropertyValue('--thread-opacity')) || .7);
    draw();
  }

  function draw() {
    if (lost || !uniforms) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.phase, elapsed / cycle * Math.PI * 2);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
  }

  function tick(now) {
    frame = 0;
    if (!running()) return;
    const dt = lastTime ? Math.min(now - lastTime, 64) : 0;
    lastTime = now;
    elapsed = (elapsed + dt) % cycle;
    const ease = 1 - Math.exp(-dt / 700);
    pointer.x += (pointer.targetX - pointer.x) * ease;
    pointer.y += (pointer.targetY - pointer.y) * ease;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    host.dataset.motion = running() ? 'playing' : 'still';
    // Pause freezes the current pose, including the pointer response.
    if (running()) frame = requestAnimationFrame(tick);
  }

  document.addEventListener('pointermove', event => {
    if (!finePointer.matches || !running()) return;
    pointer.targetX = (event.clientX / innerWidth - .5) * .32;
    pointer.targetY = (event.clientY / innerHeight - .5) * .22;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.targetX = pointer.targetY = 0; });
  document.addEventListener('visibilitychange', sync);
  for (const media of [reduced, forced]) media.addEventListener('change', sync);
  systemTheme.addEventListener('change', colors);
  new MutationObserver(() => { colors(); sync(); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(host);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    host.dataset.renderer = 'fallback';
    sync();
  });
  canvas.addEventListener('webglcontextrestored', setup);
  // Let the readable page paint before compiling the optional artwork.
  requestAnimationFrame(() => setTimeout(setup, 0));
})();
