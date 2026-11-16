import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { AssetSource, HostMessage, ViewerMessage, ViewerGarment } from '../src/mirror/protocol';

const TARGET = new THREE.Vector3(0, 0.98, 0);
const BASE_DISTANCE = 4.6;
const MIN_DISTANCE = 1.1;
const MAX_DISTANCE = 7;

function post(msg: ViewerMessage) {
  const text = JSON.stringify(msg);
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage(m: string): void } }).ReactNativeWebView;
  if (rn) rn.postMessage(text);
  else window.parent.postMessage(text, '*');
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch (e) {
  post({ type: 'state', status: 'error', message: 'This device could not start WebGL.' });
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
key.position.set(1.6, 3.2, 2.6);
scene.add(key);
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.1);
rim.position.set(-2, 2.4, -2.5);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 0.5));

// Baked contact shadow: iOS WebGL in WKWebView rendered shadow maps as a solid disc.
function contactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,20,0.42)');
  grad.addColorStop(0.45, 'rgba(40,30,20,0.18)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}
scene.add(contactShadow());

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
camera.position.set(0, TARGET.y + 0.15, BASE_DISTANCE);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = MIN_DISTANCE;
controls.maxDistance = MAX_DISTANCE;
controls.minPolarAngle = Math.PI * 0.3;
controls.maxPolarAngle = Math.PI * 0.6;
controls.rotateSpeed = 0.8;
controls.zoomToCursor = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.update();

let dirty = true;
controls.addEventListener('change', () => (dirty = true));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
window.addEventListener('resize', resize);
resize();

const FACE_Y = 1.6;
let tween: { from: THREE.Spherical; to: THREE.Spherical; fromY: number; toY: number; t0: number; ms: number } | null = null;
function animateTo(theta: number | null, radius: number | null) {
  const offset = camera.position.clone().sub(controls.target);
  const fromY = controls.target.y;
  let toY = tween ? tween.toY : fromY;
  if (radius !== null) {
    const k = THREE.MathUtils.clamp((BASE_DISTANCE / radius - 1) / 3, 0, 1);
    toY = THREE.MathUtils.lerp(TARGET.y, FACE_Y, k);
  }
  const from = new THREE.Spherical().setFromVector3(offset);
  const to = tween ? tween.to.clone() : from.clone();
  if (theta !== null) {
    let d = theta - from.theta;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    to.theta = from.theta + d;
  }
  if (radius !== null) to.radius = THREE.MathUtils.clamp(radius, MIN_DISTANCE, MAX_DISTANCE);
  tween = { from, to, fromY, toY, t0: performance.now(), ms: 450 };
}

function loop(now: number) {
  requestAnimationFrame(loop);
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(tween.from.radius, tween.to.radius, e),
      THREE.MathUtils.lerp(tween.from.phi, tween.to.phi, e),
      THREE.MathUtils.lerp(tween.from.theta, tween.to.theta, e),
    );
    controls.target.set(TARGET.x, THREE.MathUtils.lerp(tween.fromY, tween.toY, e), TARGET.z);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    if (k >= 1) tween = null;
    dirty = true;
  }
  if (controls.update()) dirty = true;
  if (dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
}
requestAnimationFrame(loop);

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function toBuffer(src: AssetSource): Promise<ArrayBuffer> {
  if ('url' in src) {
    return fetch(src.url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + src.url);
      return r.arrayBuffer();
    });
  }
  const bin = atob(src.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(bytes.buffer);
}

const ALPHA_CUTOUT = /hair|eyebrow|eyelash/i;
const fullIndex = new WeakMap<THREE.BufferGeometry, number[]>();
function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (ALPHA_CUTOUT.test(mat.name) || ALPHA_CUTOUT.test(mesh.name)) {
      mat.transparent = false;
      mat.alphaTest = /eyebrow/i.test(mat.name) ? 0.12 : 0.45;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;
    } else if (!/skin|eye/i.test(mat.name)) {
      mat.side = THREE.DoubleSide;
    }
    const hide = mesh.geometry.getAttribute('_hide');
    if (hide && mesh.geometry.index && !fullIndex.has(mesh.geometry)) {
      fullIndex.set(mesh.geometry, Array.from(mesh.geometry.index.array));
    }
  });
  return root;
}

/**
 * Rigged avatars (Avaturn exports) arrive in a T-pose. Lower the arms to a relaxed stance and
 * match the height of the baked demo body so the camera framing stays the same.
 */
const REFERENCE_HEIGHT = 1.88;
function relaxArms(root: THREE.Object3D) {
  const left = root.getObjectByName('LeftArm');
  const right = root.getObjectByName('RightArm');
  if (!left || !right) return root;
  root.updateMatrixWorld(true);
  const lower = (bone: THREE.Object3D, angle: number) => {
    if (!bone.parent) return;
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const world = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    bone.quaternion.premultiply(pq.clone().invert().multiply(world).multiply(pq));
  };
  lower(left, -1.2);
  lower(right, 1.2);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
  });
  root.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(root).max.y;
  if (height > 0.5) root.scale.multiplyScalar(REFERENCE_HEIGHT / height);
  return root;
}

function load(id: string, src?: AssetSource) {
  let p = cache.get(id);
  if (!p) {
    if (!src) return Promise.reject(new Error('Asset missing: ' + id));
    p = toBuffer(src)
      .then((buf) => loader.parseAsync(buf, ''))
      .then((gltf) => relaxArms(prepare(gltf.scene)));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

const tinted = new Map<string, Promise<THREE.Object3D>>();
function loadGarment(g: ViewerGarment) {
  const base = load(g.asset, g.src);
  if (!g.tint) return base;
  const id = g.asset + '#' + g.tint;
  let p = tinted.get(id);
  if (!p) {
    p = base.then((obj) => {
      const copy = obj.clone(true);
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.map = null;
        mat.color.set(g.tint!);
        mat.needsUpdate = true;
        mesh.material = mat;
      });
      return copy;
    });
    p.catch(() => tinted.delete(id));
    tinted.set(id, p);
  }
  return p;
}

function applyHideMasks(wornBits: number) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const full = fullIndex.get(mesh.geometry);
    if (!full) return;
    const mask = mesh.geometry.getAttribute('_hide');
    const keep: number[] = [];
    for (let i = 0; i < full.length; i += 3) {
      const a = mask.getX(full[i]) & wornBits;
      const b = mask.getX(full[i + 1]) & wornBits;
      const c = mask.getX(full[i + 2]) & wornBits;
      if (!(a && b && c)) keep.push(full[i], full[i + 1], full[i + 2]);
    }
    mesh.geometry.setIndex(keep);
  });
}

let avatar: THREE.Object3D | null = null;
const worn = new Map<string, { id: string; bit: number; object: THREE.Object3D }>();
let generation = 0;

async function setScene(avatarId: string, avatarSrc: AssetSource | null, garments: ViewerGarment[]) {
  const gen = ++generation;
  post({ type: 'state', status: 'loading' });
  try {
    const [nextAvatar, ...objects] = await Promise.all([load(avatarId, avatarSrc ?? undefined), ...garments.map(loadGarment)]);
    if (gen !== generation) return;
    if (avatar !== nextAvatar) {
      if (avatar) scene.remove(avatar);
      avatar = nextAvatar;
      scene.add(avatar);
    }
    const nextSlots = new Map(garments.map((g, i) => [g.slot, { id: g.id, bit: g.bit, object: objects[i] }]));
    for (const [slot, cur] of worn) {
      const next = nextSlots.get(slot);
      if (!next || next.id !== cur.id) {
        scene.remove(cur.object);
        worn.delete(slot);
      }
    }
    for (const [slot, next] of nextSlots) {
      if (!worn.has(slot)) {
        scene.add(next.object);
        worn.set(slot, next);
      }
    }
    let bits = 0;
    for (const w of worn.values()) bits |= w.bit;
    applyHideMasks(bits);
    dirty = true;
    post({ type: 'state', status: 'ready', slots: Object.fromEntries([...worn].map(([s, w]) => [s, w.id])) });
  } catch (e) {
    if (gen !== generation) return;
    post({ type: 'state', status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

function receive(raw: string | HostMessage) {
  const msg: HostMessage = typeof raw === 'string' ? JSON.parse(raw) : raw;
  switch (msg.type) {
    case 'scene':
      setScene(msg.avatarId, msg.avatarSrc, msg.garments);
      break;
    case 'reset':
      controls.target.x = TARGET.x;
      controls.target.z = TARGET.z;
      animateTo(0, BASE_DISTANCE);
      break;
    case 'rotateTo':
      animateTo(THREE.MathUtils.degToRad(msg.yawDeg), null);
      break;
    case 'zoom':
      animateTo(null, BASE_DISTANCE / Math.max(0.1, msg.scale));
      break;
  }
}

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  post({ type: 'state', status: 'error', message: 'The 3D view was interrupted.' });
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('message', (e) => {
  if (typeof e.data === 'string' && e.data.startsWith('{')) receive(e.data);
});
(window as unknown as { __mirror: unknown }).__mirror = { receive };
post({ type: 'booted' });
