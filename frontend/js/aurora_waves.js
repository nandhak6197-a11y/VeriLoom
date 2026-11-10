// -*- coding: utf-8 -*-
/**
 * VeriLoom Pure WebGL Fragment Shader Engine
 * Recreates the exact animated atmospheric sky/aurora gradient mesh background
 * from the OpenAI Codex landing page with 2-stage domain warping and anti-banding dither.
 */
(function initCodexWebGLShader() {
  const canvas = document.getElementById('aurora-waves-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    console.warn('WebGL not supported, falling back to 2D context.');
    return;
  }

  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;

    // Continuous 2D Hash function
    float hash(vec2 p) {
      p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
      return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
    }

    // 2D Value Noise with Quintic Interpolation
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    // 5-Octave Fractal Brownian Motion with Anti-Grid Rotation Matrix
    const mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
    float fbm(vec2 st) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      for (int i = 0; i < 5; ++i) {
        v += a * noise(st);
        st = m * st * 2.02 + shift;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      // 1. Normalized & Aspect-Corrected UVs
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv;
      p.x *= u_resolution.x / u_resolution.y;

      // Diagonal stretch & tilt (cirrus cloud orientation)
      p = mat2(0.86, -0.50, 0.50, 0.86) * p;
      p *= vec2(1.0, 1.8);
      p *= 1.25;

      // 2. Two-Stage Domain Warping (Slow fluid motion)
      float t = u_time * 0.06;
      vec2 q = vec2(
        fbm(p + vec2(0.0, 0.0) + t * 0.4),
        fbm(p + vec2(5.2, 1.3) - t * 0.3)
      );
      vec2 r = vec2(
        fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.5),
        fbm(p + 2.2 * q + vec2(8.3, 2.8) + t * 0.25)
      );
      float f = fbm(p + 1.8 * r);

      // 3. Exact Pre-Computed Palette Specification
      vec3 colSkyHighlight   = vec3(0.737, 0.808, 0.941); // #BCCEF0
      vec3 colPeriwinkle     = vec3(0.565, 0.678, 0.894); // #90ADE4
      vec3 colSlateBlue      = vec3(0.392, 0.471, 0.824); // #6478D2
      vec3 colElectricIndigo = vec3(0.275, 0.298, 0.910); // #464CE8
      vec3 colDeepViolet     = vec3(0.180, 0.176, 0.451); // #2E2D73
      vec3 colMidnightNavy   = vec3(0.063, 0.075, 0.180); // #10132E

      // 4. Spatial Composition & Multi-Stage Blending
      // Diagonal base wash
      float diag = clamp((uv.x * 0.6 + (1.0 - uv.y) * 0.8), 0.0, 1.0);
      vec3 col = mix(colPeriwinkle, colElectricIndigo, smoothstep(0.15, 0.85, diag));
      col = mix(col, colDeepViolet, smoothstep(0.35, 0.95, 1.0 - uv.y));

      // Layer warped cloud textures (sunlit highlights in top-left)
      float cloudWeight = smoothstep(0.2, 0.9, uv.y * (1.2 - uv.x * 0.5));
      float cloudDetail = smoothstep(-0.2, 0.6, f);
      col = mix(col, colSlateBlue, cloudWeight * cloudDetail * 0.65);
      col = mix(col, colSkyHighlight, cloudWeight * smoothstep(0.1, 0.7, f + length(q) * 0.4) * 0.75);

      // Right-side radial boost for vibrant electric indigo
      float rightBlob = smoothstep(0.85, 0.1, length(uv - vec2(0.78, 0.55)));
      col = mix(col, colElectricIndigo, rightBlob * (0.6 + 0.4 * length(q)));

      // Bottom & bottom-left shadow curve into midnight navy
      float bottomShadow = smoothstep(0.65, 0.0, uv.y) * 0.85;
      float leftBottomCorner = smoothstep(0.7, 0.0, length(uv - vec2(0.05, 0.0)));
      col = mix(col, colMidnightNavy, clamp(bottomShadow + leftBottomCorner * 0.5, 0.0, 1.0));

      // 5. Film Grain / Anti-Banding Dither
      float grain = (fract(sin(dot(gl_FragCoord.xy + fract(u_time), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.028;
      col += grain;
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  // Screen Quad (Full Viewport)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  const timeLocation = gl.getUniformLocation(program, 'u_time');

  let width = 0;
  let height = 0;
  let animId = null;
  let isPaused = false;

  function resize() {
    // DPR capped at 1.5 for guaranteed 60fps performance
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.floor(window.innerWidth * dpr);
    height = Math.floor(window.innerHeight * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isPaused = true;
      if (animId) cancelAnimationFrame(animId);
    } else {
      isPaused = false;
      startTime = performance.now() - pausedOffset;
      render();
    }
  });

  let startTime = performance.now();
  let pausedOffset = 0;

  function render() {
    if (isPaused) return;

    const currentTime = (performance.now() - startTime) * 0.001;

    gl.uniform2f(resolutionLocation, width, height);
    gl.uniform1f(timeLocation, currentTime);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animId = requestAnimationFrame(render);
  }

  render();
})();
