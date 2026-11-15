/*
 * Self-contained WebGL2 Gaussian splat viewer page, rendered inside a WebView (native) or an iframe (web).
 *
 * The renderer core (texture packing of centers/covariances/colors, the 2D covariance projection shader,
 * front-to-back "under" blending, and the 16-bit counting depth sort in a worker) is adapted from
 * antimatter15/splat, https://github.com/antimatter15/splat, MIT License, Copyright (c) 2023 Kevin Kwok.
 * Camera, auto-framing, gestures, proportion edit and the RN bridge are written for this app.
 *
 * Input: antimatter15 ".splat" layout, 32 bytes per gaussian:
 *   3 x f32 position, 3 x f32 scale, 4 x u8 RGBA, 4 x u8 quaternion (w, x, y, z) encoded as q * 128 + 128.
 *
 * Page -> host messages (JSON strings): ready, loaded {count, loadMs, fetchMs, bytes, via}, fps {fps},
 * error {message}, needBytes. Host -> page: window.__splatChunk(index, total, base64) when fetch() fails.
 */

export type SplatUpAxis = 'y' | '-y' | 'z' | '-z';

export type SplatViewerConfig = {
  url: string | null;
  up: SplatUpAxis;
  yaw?: number;
};

export type SplatViewerMessage =
  | { type: 'ready' }
  | { type: 'loaded'; count: number; loadMs: number; fetchMs: number; bytes: number; via: 'fetch' | 'bridge' }
  | { type: 'fps'; fps: number }
  | { type: 'error'; message: string }
  | { type: 'needBytes'; reason: string };

export function buildSplatViewerHtml(config: SplatViewerConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return PAGE.replace('__SPLAT_CONFIG__', () => json);
}

const PAGE = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: radial-gradient(ellipse at 50% 35%, #3a3532 0%, #141210 75%); touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  #status { position: absolute; left: 0; right: 0; top: 45%; text-align: center; color: #d8d0c6; font: 14px -apple-system, system-ui, sans-serif; pointer-events: none; padding: 0 24px; }
  #hint { position: absolute; left: 0; right: 0; bottom: calc(86px + env(safe-area-inset-bottom)); text-align: center; color: rgba(255,255,255,.45); font: 11px -apple-system, system-ui, sans-serif; pointer-events: none; }
  #prop { position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); padding: 8px 12px; border-radius: 12px; background: rgba(0,0,0,.45); color: #eee; font: 11px -apple-system, system-ui, sans-serif; }
  #prop .t { opacity: .7; margin-bottom: 4px; }
  #prop label { display: flex; align-items: center; gap: 8px; height: 26px; }
  #prop input { flex: 1; touch-action: pan-x; }
  #prop span.v { width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="status">Loading splat...</div>
<div id="hint">drag: rotate &middot; pinch / wheel: zoom &middot; double-tap: reset</div>
<div id="prop">
  <div class="t">Proportion edit (experimental)</div>
  <label>Height <input id="sh" type="range" min="0.8" max="1.25" step="0.01" value="1" /><span class="v" id="shv">1.00</span></label>
  <label>Width <input id="sw" type="range" min="0.8" max="1.25" step="0.01" value="1" /><span class="v" id="swv">1.00</span></label>
  <label>Zoom (test) <input id="sz" type="range" min="0" max="1" step="0.01" value="0" /><span class="v" id="szv">0.00</span></label>
</div>
<script id="sortsrc" type="text/plain">
function sortDepth(view, positions, n) {
  var depths = new Float32Array(n);
  var minD = Infinity, maxD = -Infinity;
  var a = view[2], b = view[6], c = view[10];
  for (var i = 0; i < n; i++) {
    var d = a * positions[3 * i] + b * positions[3 * i + 1] + c * positions[3 * i + 2];
    depths[i] = d;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
  var bins = 65536;
  var inv = (bins - 1) / (maxD - minD || 1);
  var keys = new Uint16Array(n);
  var counts = new Uint32Array(bins);
  for (var i = 0; i < n; i++) {
    var k = ((depths[i] - minD) * inv) | 0;
    keys[i] = k;
    counts[k]++;
  }
  var starts = new Uint32Array(bins);
  for (var i = 1; i < bins; i++) starts[i] = starts[i - 1] + counts[i - 1];
  var out = new Uint32Array(n);
  for (var i = 0; i < n; i++) out[starts[keys[i]]++] = i;
  return out;
}
var positions = null, count = 0;
self.onmessage = function (e) {
  if (e.data.positions) { positions = e.data.positions; count = e.data.count; return; }
  if (e.data.view && positions) {
    var idx = sortDepth(e.data.view, positions, count);
    self.postMessage({ depthIndex: idx }, [idx.buffer]);
  }
};
</script>
<script>
(function () {
  var CONFIG = __SPLAT_CONFIG__;
  var t0 = performance.now();
  var statusEl = document.getElementById('status');

  function post(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, '*');
  }
  var failed = false;
  function fail(message) {
    if (failed) return;
    failed = true;
    statusEl.textContent = message;
    post({ type: 'error', message: message });
  }
  window.addEventListener('error', function (e) { fail('JS error: ' + (e.message || e)); });

  var canvas = document.getElementById('c');
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) { fail('WebGL2 unavailable in this WebView'); return; }

  var VS = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'uniform highp usampler2D u_texture;',
    'uniform mat4 projection, view;',
    'uniform vec2 focal;',
    'uniform vec2 viewport;',
    'in vec2 position;',
    'in int index;',
    'out vec4 vColor;',
    'out vec2 vPosition;',
    'void main () {',
    '  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
    '  uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);',
    '  vec4 cam = view * vec4(uintBitsToFloat(cen.xyz), 1);',
    '  vec4 pos2d = projection * cam;',
    '  float clip = 1.2 * pos2d.w;',
    '  if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) return;',
    '  uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);',
    '  vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);',
    '  mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);',
    '  mat3 J = mat3(focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z), 0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z), 0., 0., 0.);',
    '  mat3 T = transpose(mat3(view)) * J;',
    '  mat3 cov2d = transpose(T) * Vrk * T;',
    '  float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;',
    '  float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));',
    '  float lambda1 = mid + radius, lambda2 = mid - radius;',
    '  if (lambda2 < 0.0) return;',
    '  vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));',
    '  vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;',
    '  vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);',
    '  vColor = clamp(pos2d.z / pos2d.w + 1.0, 0.0, 1.0) * vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;',
    '  vPosition = position;',
    '  vec2 vCenter = vec2(pos2d) / pos2d.w;',
    '  gl_Position = vec4(vCenter + position.x * majorAxis / viewport + position.y * minorAxis / viewport, 0.0, 1.0);',
    '}'
  ].join('\n');
  var FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 vColor;',
    'in vec2 vPosition;',
    'out vec4 fragColor;',
    'void main () {',
    '  float A = -dot(vPosition, vPosition);',
    '  if (A < -4.0) discard;',
    '  float B = exp(A) * vColor.a;',
    '  fragColor = vec4(B * vColor.rgb, B);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  var program = gl.createProgram();
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  } catch (err) { fail(String(err.message || err)); return; }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { fail('Link: ' + gl.getProgramInfoLog(program)); return; }
  gl.useProgram(program);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

  var uProjection = gl.getUniformLocation(program, 'projection');
  var uView = gl.getUniformLocation(program, 'view');
  var uFocal = gl.getUniformLocation(program, 'focal');
  var uViewport = gl.getUniformLocation(program, 'viewport');

  var quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW);
  var aPosition = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  var indexBuf = gl.createBuffer();
  var aIndex = gl.getAttribLocation(program, 'index');
  gl.enableVertexAttribArray(aIndex);
  gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
  gl.vertexAttribIPointer(aIndex, 1, gl.INT, false, 0, 0);
  gl.vertexAttribDivisor(aIndex, 1);

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  var _hf = new Float32Array(1), _hi = new Int32Array(_hf.buffer);
  function toHalf(v) {
    _hf[0] = v;
    var x = _hi[0];
    var bits = (x >> 16) & 0x8000;
    var m = (x >> 12) & 0x07ff;
    var e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) { bits |= 0x7c00; bits |= (e == 255 ? 0 : 1) && x & 0x007fffff; return bits; }
    if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
  }
  function packHalf2x16(a, b) { return (toHalf(a) | (toHalf(b) << 16)) >>> 0; }

  var ROT = {
    'y': [1, 0, 0, 0, 1, 0, 0, 0, 1],
    '-y': [1, 0, 0, 0, -1, 0, 0, 0, -1],
    'z': [1, 0, 0, 0, 0, 1, 0, -1, 0],
    '-z': [1, 0, 0, 0, 0, -1, 0, 1, 0]
  };
  var R = ROT[CONFIG.up] || ROT['-y'];

  var count = 0, center = [0, 0, 0], ext = [1, 1, 1];
  var sortWorker = null, sortLocal = null;
  var haveIndex = false, sortBusy = false, pendingView = null, lastSortKey = null;
  var loaded = false, firstDrawn = false, loadInfo = null;

  function percentileBox(f, u8, n) {
    var stride = Math.max(1, Math.floor(n / 60000));
    var xs = [], ys = [], zs = [];
    for (var pass = 0; pass < 2 && xs.length < 100; pass++) {
      for (var i = 0; i < n; i += stride) {
        if (pass === 0 && u8[32 * i + 27] < 40) continue;
        xs.push(f[8 * i]); ys.push(f[8 * i + 1]); zs.push(f[8 * i + 2]);
      }
    }
    function range(arr) {
      arr.sort(function (a, b) { return a - b; });
      return [arr[Math.floor(arr.length * 0.02)], arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.98))]];
    }
    return [range(xs), range(ys), range(zs)];
  }

  function onBytes(buf, via, fetchMs) {
    var n = Math.floor(buf.byteLength / 32);
    if (!n) { fail('Splat file is empty or not .splat'); return; }
    statusEl.textContent = 'Preparing ' + n + ' gaussians...';
    var f = new Float32Array(buf, 0, n * 8);
    var u8 = new Uint8Array(buf);
    var texW = 2048, texH = Math.ceil((2 * n) / texW);
    if (texH > gl.getParameter(gl.MAX_TEXTURE_SIZE)) { fail('Too many gaussians for this GPU (' + n + ')'); return; }
    var tex = new Uint32Array(texW * texH * 4);
    var texF = new Float32Array(tex.buffer);
    var texU8 = new Uint8Array(tex.buffer);
    var positions = new Float32Array(3 * n);
    for (var i = 0; i < n; i++) {
      var px = f[8 * i], py = f[8 * i + 1], pz = f[8 * i + 2];
      texF[8 * i] = px; texF[8 * i + 1] = py; texF[8 * i + 2] = pz;
      positions[3 * i] = px; positions[3 * i + 1] = py; positions[3 * i + 2] = pz;
      var o = 4 * (8 * i + 7), s = 32 * i + 24;
      texU8[o] = u8[s]; texU8[o + 1] = u8[s + 1]; texU8[o + 2] = u8[s + 2]; texU8[o + 3] = u8[s + 3];
      var sx = f[8 * i + 3], sy = f[8 * i + 4], sz = f[8 * i + 5];
      var qw = (u8[32 * i + 28] - 128) / 128, qx = (u8[32 * i + 29] - 128) / 128, qy = (u8[32 * i + 30] - 128) / 128, qz = (u8[32 * i + 31] - 128) / 128;
      var ql = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) || 1;
      qw /= ql; qx /= ql; qy /= ql; qz /= ql;
      var m0 = (1 - 2 * (qy * qy + qz * qz)) * sx, m1 = 2 * (qx * qy + qw * qz) * sx, m2 = 2 * (qx * qz - qw * qy) * sx;
      var m3 = 2 * (qx * qy - qw * qz) * sy, m4 = (1 - 2 * (qx * qx + qz * qz)) * sy, m5 = 2 * (qy * qz + qw * qx) * sy;
      var m6 = 2 * (qx * qz + qw * qy) * sz, m7 = 2 * (qy * qz - qw * qx) * sz, m8 = (1 - 2 * (qx * qx + qy * qy)) * sz;
      tex[8 * i + 4] = packHalf2x16(4 * (m0 * m0 + m3 * m3 + m6 * m6), 4 * (m0 * m1 + m3 * m4 + m6 * m7));
      tex[8 * i + 5] = packHalf2x16(4 * (m0 * m2 + m3 * m5 + m6 * m8), 4 * (m1 * m1 + m4 * m4 + m7 * m7));
      tex[8 * i + 6] = packHalf2x16(4 * (m1 * m2 + m4 * m5 + m7 * m8), 4 * (m2 * m2 + m5 * m5 + m8 * m8));
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, texW, texH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, tex);

    var box = percentileBox(f, u8, n);
    var e = [box[0][1] - box[0][0], box[1][1] - box[1][0], box[2][1] - box[2][0]];
    center = [(box[0][0] + box[0][1]) / 2, (box[1][0] + box[1][1]) / 2, (box[2][0] + box[2][1]) / 2];
    ext = [
      Math.abs(R[0] * e[0] + R[1] * e[1] + R[2] * e[2]),
      Math.abs(R[3] * e[0] + R[4] * e[1] + R[5] * e[2]),
      Math.abs(R[6] * e[0] + R[7] * e[1] + R[8] * e[2])
    ];

    count = n;
    var src = document.getElementById('sortsrc').textContent;
    try {
      sortWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      sortWorker.onmessage = function (ev) { onSorted(ev.data.depthIndex); };
      sortWorker.onerror = function () { sortWorker = null; useLocalSort(src, positions, n); sortBusy = false; lastSortKey = null; };
      sortWorker.postMessage({ positions: positions.slice(), count: n });
    } catch (err) {
      sortWorker = null;
      useLocalSort(src, positions, n);
    }
    loadInfo = { count: n, fetchMs: Math.round(fetchMs), bytes: buf.byteLength, via: via };
    loaded = true;
    resetCamera();
  }

  function useLocalSort(src, positions, n) {
    var sortFn = new Function(src + '\nreturn sortDepth;')();
    sortLocal = function (view) { return sortFn(view, positions, n); };
  }

  function onSorted(depthIndex) {
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
    haveIndex = true;
    sortBusy = false;
    if (pendingView) { var v = pendingView; pendingView = null; requestSort(v); }
  }

  function requestSort(view) {
    if (sortBusy) { pendingView = view; return; }
    sortBusy = true;
    if (sortWorker) sortWorker.postMessage({ view: view });
    else setTimeout(function () { onSorted(sortLocal(view)); }, 0);
  }

  var FOVY = 50 * Math.PI / 180;
  var cam = { yaw: 0, pitch: 0, dist: 1, minDist: 0.5, maxDist: 2, homeDist: 1 };
  var scaleH = 1, scaleW = 1;
  var PITCH_MIN = -25 * Math.PI / 180, PITCH_MAX = 35 * Math.PI / 180;

  function updateLimits() {
    var h = ext[1] * scaleH, w = Math.max(ext[0], ext[2]) * scaleW;
    var rxz = 0.5 * Math.hypot(ext[0], ext[2]) * scaleW;
    var tanY = Math.tan(FOVY / 2), tanX = tanY * (canvas.width / Math.max(1, canvas.height));
    var fit = Math.max((h / 2) / tanY, (w / 2) / tanX) + rxz;
    cam.maxDist = fit * 1.2;
    cam.homeDist = fit * 1.05;
    cam.minDist = Math.min(cam.homeDist, Math.max((0.4 * h / 2) / tanY + 0.5 * rxz, 1.3 * rxz));
    cam.dist = Math.min(cam.maxDist, Math.max(cam.minDist, cam.dist));
  }

  function resetCamera() {
    cam.yaw = CONFIG.yaw || 0;
    cam.pitch = 5 * Math.PI / 180;
    updateLimits();
    cam.dist = cam.homeDist;
  }

  function mul4(a, b) {
    var out = new Float32Array(16);
    for (var col = 0; col < 4; col++)
      for (var row = 0; row < 4; row++)
        out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    return out;
  }

  function viewModelMatrix() {
    var model = new Float32Array([
      scaleW * R[0], scaleH * R[3], scaleW * R[6], 0,
      scaleW * R[1], scaleH * R[4], scaleW * R[7], 0,
      scaleW * R[2], scaleH * R[5], scaleW * R[8], 0,
      0, 0, 0, 1
    ]);
    model[12] = -(model[0] * center[0] + model[4] * center[1] + model[8] * center[2]);
    model[13] = -(model[1] * center[0] + model[5] * center[1] + model[9] * center[2]);
    model[14] = -(model[2] * center[0] + model[6] * center[1] + model[10] * center[2]);

    var zoomT = Math.min(1, Math.max(0, (cam.maxDist - cam.dist) / Math.max(1e-6, cam.maxDist - cam.minDist)));
    var target = [0, zoomT * 0.28 * ext[1] * scaleH, 0];
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var eye = [target[0] + cam.dist * cp * Math.sin(cam.yaw), target[1] + cam.dist * sp, target[2] + cam.dist * cp * Math.cos(cam.yaw)];
    var fw = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    var fl = Math.hypot(fw[0], fw[1], fw[2]);
    fw = [fw[0] / fl, fw[1] / fl, fw[2] / fl];
    var rl = Math.hypot(fw[2], fw[0]) || 1;
    var rt = [-fw[2] / rl, 0, fw[0] / rl];
    var dn = [fw[1] * rt[2] - fw[2] * rt[1], fw[2] * rt[0] - fw[0] * rt[2], fw[0] * rt[1] - fw[1] * rt[0]];
    var view = new Float32Array([
      rt[0], dn[0], fw[0], 0,
      rt[1], dn[1], fw[1], 0,
      rt[2], dn[2], fw[2], 0,
      -(rt[0] * eye[0] + rt[1] * eye[1] + rt[2] * eye[2]),
      -(dn[0] * eye[0] + dn[1] * eye[1] + dn[2] * eye[2]),
      -(fw[0] * eye[0] + fw[1] * eye[1] + fw[2] * eye[2]),
      1
    ]);
    return mul4(view, model);
  }

  var lastW = 0, lastH = 0;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    if (loaded) updateLimits();
  }

  var frames = 0, lastFps = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    resize();
    frames++;
    if (now - lastFps >= 1000) {
      post({ type: 'fps', fps: Math.round((frames * 1000) / (now - lastFps)) });
      frames = 0;
      lastFps = now;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!loaded) return;

    var vm = viewModelMatrix();
    var fwd = [vm[2], vm[6], vm[10]];
    var key = lastSortKey;
    if (!key || fwd[0] * key[0] + fwd[1] * key[1] + fwd[2] * key[2] < 0.9995 * Math.hypot(fwd[0], fwd[1], fwd[2]) * Math.hypot(key[0], key[1], key[2])) {
      lastSortKey = fwd;
      requestSort(vm);
    }
    if (!haveIndex) return;

    var W = canvas.width, H = canvas.height;
    var focalPx = (H / 2) / Math.tan(FOVY / 2);
    var span = Math.hypot(ext[0], ext[1], ext[2]) * Math.max(scaleH, scaleW);
    var znear = Math.max(1e-4, span * 0.01), zfar = span * 100 + cam.maxDist;
    gl.uniformMatrix4fv(uProjection, false, new Float32Array([
      (2 * focalPx) / W, 0, 0, 0,
      0, -(2 * focalPx) / H, 0, 0,
      0, 0, zfar / (zfar - znear), 1,
      0, 0, -(zfar * znear) / (zfar - znear), 0
    ]));
    gl.uniformMatrix4fv(uView, false, vm);
    gl.uniform2f(uFocal, focalPx, focalPx);
    gl.uniform2f(uViewport, W, H);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, count);

    if (!firstDrawn) {
      firstDrawn = true;
      statusEl.textContent = '';
      loadInfo.type = 'loaded';
      loadInfo.loadMs = Math.round(performance.now() - t0);
      post(loadInfo);
    }
  }
  requestAnimationFrame(frame);

  var pointers = {};
  var gesture = null;
  var lastTap = 0;
  function pointerList() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }
  function beginGesture() {
    var p = pointerList();
    if (p.length >= 2) gesture = { kind: 'pinch', span: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, dist: cam.dist };
    else if (p.length === 1) gesture = { kind: 'rotate', x: p[0].x, y: p[0].y, yaw: cam.yaw, pitch: cam.pitch };
    else gesture = null;
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY };
    beginGesture();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p || !gesture) return;
    p.x = e.clientX; p.y = e.clientY;
    var list = pointerList();
    if (gesture.kind === 'pinch' && list.length >= 2) {
      var s = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) || 1;
      cam.dist = Math.min(cam.maxDist, Math.max(cam.minDist, gesture.dist * (gesture.span / s)));
    } else if (gesture.kind === 'rotate') {
      var k = 2 * Math.PI / Math.max(320, canvas.clientWidth * 1.6);
      cam.yaw = gesture.yaw - (p.x - gesture.x) * k;
      cam.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, gesture.pitch + (p.y - gesture.y) * k));
    }
    e.preventDefault();
  });
  function endPointer(e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    delete pointers[e.pointerId];
    var now = performance.now();
    var isTap = now - p.t < 250 && Math.hypot(p.x - p.sx, p.y - p.sy) < 10 && Object.keys(pointers).length === 0;
    if (isTap) {
      if (now - lastTap < 320) { resetCamera(); lastTap = 0; }
      else lastTap = now;
    }
    beginGesture();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    cam.dist = Math.min(cam.maxDist, Math.max(cam.minDist, cam.dist * Math.exp(e.deltaY * 0.0015)));
    e.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'touchmove'].forEach(function (name) {
    document.addEventListener(name, function (e) { if (e.target === canvas || name !== 'touchmove') e.preventDefault(); }, { passive: false });
  });

  function bindSlider(id, apply) {
    var input = document.getElementById(id), label = document.getElementById(id + 'v');
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      label.textContent = v.toFixed(2);
      apply(v);
      lastSortKey = null;
      if (loaded) updateLimits();
    });
  }
  bindSlider('sh', function (v) { scaleH = v; });
  bindSlider('sw', function (v) { scaleW = v; });
  bindSlider('sz', function (v) { cam.dist = cam.maxDist - v * (cam.maxDist - cam.minDist); });

  var chunks = null;
  window.__splatChunk = function (index, total, b64) {
    if (!chunks) chunks = { parts: new Array(total), got: 0, t: performance.now() };
    if (!chunks.parts[index]) { chunks.parts[index] = b64; chunks.got++; }
    statusEl.textContent = 'Receiving splat ' + chunks.got + '/' + total + '...';
    if (chunks.got < total) return;
    var bin = atob(chunks.parts.join(''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var ms = performance.now() - chunks.t;
    chunks = null;
    onBytes(bytes.buffer, 'bridge', ms);
  };

  function requestBridge(reason) {
    statusEl.textContent = 'Fetch failed (' + reason + '), asking app for bytes...';
    post({ type: 'needBytes', reason: reason });
  }

  post({ type: 'ready' });
  if (!CONFIG.url) { requestBridge('no url'); return; }
  var tf = performance.now();
  fetch(CONFIG.url)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    })
    .then(function (buf) { onBytes(buf, 'fetch', performance.now() - tf); })
    .catch(function (err) { requestBridge(String((err && err.message) || err)); });
})();
</script>
</body>
</html>`;
