import { DEFAULT_COLORS, SLOT_LABELS } from './copy.js';

export { DEFAULT_COLORS, SLOT_LABELS };

// 牛子大王 · 18 件装饰的 Three.js 建模与 SVG 缩略图。
// 造型是低多边形、戏谑化的，不做写实色情渲染；所有装饰只改外观，不参与数值。
export const MODEL_IDS = Object.freeze([
  'a-cone', 'a-sphere', 'a-heart', 'a-hook', 'a-face', 'a-rocket', 'a-urchin',
  'b-spindle', 'b-veins', 'b-texture', 'b-spikes', 'b-spring', 'b-lettering',
  'c-sparse', 'c-fluffy', 'c-lush', 'c-fins', 'c-huge',
]);

const MODEL_SET = new Set(MODEL_IDS);
const validSlot = slot => slot === 'a' || slot === 'b' || slot === 'c';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeColor = (color, fallback = '#c08260') => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;

export const hasCosmeticModel = (id, slot) => validSlot(slot)
  && typeof id === 'string'
  && id.startsWith(`${slot}-`)
  && MODEL_SET.has(id);

// 释放模型上共享的几何体、材质与贴图；同一资源只释放一次。
export function disposeModel(group) {
  const resources = new Set();
  group?.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !value.userData?.shared) resources.add(value);
      }
    }
  });
  resources.forEach(resource => resource.dispose());
}

// 铭文字母的矢量笔画，避免依赖字体文件或 CDN。
const GLYPHS = {
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  A: [[[0, 0], [.5, 1], [1, 0]], [[.2, .4], [.8, .4]]],
  M: [[[0, 0], [0, 1], [.5, .45], [1, 1], [1, 0]]],
  C: [[[1, .9], [.15, 1], [0, .5], [.15, 0], [1, .1]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, .5], [1, .5]]],
  I: [[[.5, 0], [.5, 1]], [[0, 0], [1, 0]], [[0, 1], [1, 1]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, .5], [.8, .5]]],
};

const SHAFT_BOTTOM = 0.02;
const SHAFT_TOP = 3.16;
const SHAFT_RADIUS = 0.46;
const GLANS_BASE = 3.06;
const SCROTUM_Y = -0.62;
const SCROTUM_X = 0.48;
const SCROTUM_RADIUS = 0.74;

// ---------- 程序化皮肤 ----------
// 不依赖外部图片：用可平铺的周期值噪声生成颜色斑驳、粗糙度和毛孔凹凸。
// 纹理按槽位缓存，模型切换只换材质颜色，不重复生成像素。
const SKIN_TEXTURE_SIZE = 256;
const textureCache = new WeakMap();

function createTileableNoise(seed) {
  const hash = (x, y, period) => {
    const xi = ((x % period) + period) % period;
    const yi = ((y % period) + period) % period;
    let h = Math.imul(xi + 1, 374761393) ^ Math.imul(yi + 1, 668265263) ^ Math.imul(seed + 1, 69069);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = t => t * t * (3 - 2 * t);
  return (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = hash(xi, yi, period), b = hash(xi + 1, yi, period);
    const c = hash(xi, yi + 1, period), d = hash(xi + 1, yi + 1, period);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

function skinNoise(noise, u, v) {
  return .5 * noise(u * 4, v * 4, 4)
    + .28 * noise(u * 8, v * 8, 8)
    + .14 * noise(u * 16, v * 16, 16)
    + .08 * noise(u * 32, v * 32, 32);
}

function makeSkinTexture(THREE, data, size, colorSpace) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.userData.shared = true;
  texture.needsUpdate = true;
  return texture;
}

function createSkinTextures(THREE, slot) {
  let cached = textureCache.get(THREE);
  if (!cached) {
    cached = {};
    textureCache.set(THREE, cached);
  }
  if (cached[slot]) return cached[slot];

  const size = SKIN_TEXTURE_SIZE;
  const noise = createTileableNoise(slot === 'a' ? 0x51A7 : slot === 'b' ? 0xB16B : 0xC0FFEE);
  const mapData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const bumpData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size, v = y / size;
      const broad = skinNoise(noise, u, v);
      const fine = noise(u * 48, v * 48, 48);
      const ultra = noise(u * 96, v * 96, 96);
      const wrinkle = slot === 'c'
        ? Math.pow(Math.max(0, Math.sin((v * 9 + broad * 1.1) * Math.PI * 2)), 2)
        : 0;
      const striation = slot === 'b'
        ? Math.sin((u * 16 + fine * .8) * Math.PI * 2) * .5 + .5
        : 0;
      const pore = Math.max(0, fine - .68) * 90;
      const follicle = slot === 'c' ? Math.max(0, ultra - .72) * 80 : 0;
      const vein = slot === 'b'
        ? Math.pow(Math.max(0, Math.sin((u * 7 + Math.sin(v * 11 + broad * 3) * .8) * Math.PI * 2)), 8)
        : 0;
      const capillary = slot === 'a'
        ? Math.pow(Math.max(0, Math.sin((u * 9 + Math.sin(v * 13 + broad * 2) * .7) * Math.PI * 2)), 4)
        : 0;

      let base = 226 + Math.round((broad - .5) * 32 + (fine - .5) * 14);
      let r = base, g = base, b = base;
      if (slot === 'a') { r += 6; g -= 1; b -= 4; }
      else if (slot === 'b') { r += 2; b -= 2; }
      else { r -= 5; g -= 3; b -= 2; }
      if (slot === 'a') {
        const patch = Math.max(0, broad - .45) * 2;
        r += patch * 16; g -= patch * 4; b -= patch * 5;
      }
      if (slot === 'c' && wrinkle > .72) { r -= 15; g -= 13; b -= 12; }
      if (slot === 'b' && striation > .78) { r -= 6; g -= 5; b -= 5; }
      r += Math.round(capillary * 12);
      g -= Math.round(capillary * 5);
      b -= Math.round(capillary * 4);
      r -= Math.round(pore * .45 + follicle * .34 + vein * 10);
      g -= Math.round(pore * .45 + follicle * .34 + vein * 13);
      b -= Math.round(pore * .44 + follicle * .34 + vein * 10);
      const offset = (y * size + x) * 4;
      mapData[offset] = clamp(Math.round(r), 0, 255);
      mapData[offset + 1] = clamp(Math.round(g), 0, 255);
      mapData[offset + 2] = clamp(Math.round(b), 0, 255);
      mapData[offset + 3] = 255;

      let rough = slot === 'a' ? .44 : slot === 'b' ? .52 : .64;
      rough += (broad - .5) * .22 + (fine - .5) * (slot === 'a' ? .18 : .12);
      if (slot === 'c') rough += wrinkle * .12;
      if (slot === 'b') rough += striation * .05 - vein * .05;
      rough += pore * .0014;
      const roughByte = clamp(Math.round(rough * 255), 0, 255);
      roughData[offset] = roughByte;
      roughData[offset + 1] = roughByte;
      roughData[offset + 2] = roughByte;
      roughData[offset + 3] = 255;

      let height = .5 + (broad - .5) * .7 + (fine - .5) * .35;
      if (slot === 'c') height += wrinkle * .32;
      if (slot === 'b') height += striation * .1 + vein * .06;
      if (slot === 'a') height += (broad - .5) * .24 + capillary * .045;
      height -= pore * .003 + follicle * .0024;
      const bumpByte = clamp(Math.round(height * 255), 0, 255);
      bumpData[offset] = bumpByte;
      bumpData[offset + 1] = bumpByte;
      bumpData[offset + 2] = bumpByte;
      bumpData[offset + 3] = 255;
    }
  }

  const repeat = slot === 'a' ? [2, 2] : slot === 'b' ? [2, 3] : [2, 2];
  const map = makeSkinTexture(THREE, mapData, size, THREE.SRGBColorSpace);
  const roughnessMap = makeSkinTexture(THREE, roughData, size, THREE.NoColorSpace ?? '');
  const bumpMap = makeSkinTexture(THREE, bumpData, size, THREE.NoColorSpace ?? '');
  for (const texture of [map, roughnessMap, bumpMap]) texture.repeat.set(...repeat);
  cached[slot] = { map, roughnessMap, bumpMap };
  return cached[slot];
}

function skinMaterial(THREE, slot, color) {
  const textures = createSkinTextures(THREE, slot);
  const baseColor = safeColor(color, DEFAULT_COLORS[slot]);
  const sheenColor = new THREE.Color(baseColor).lerp(new THREE.Color('#ffe6d5'), .58);
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    bumpMap: textures.bumpMap,
    bumpScale: slot === 'a' ? .055 : slot === 'b' ? .05 : .065,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    sheen: slot === 'a' ? .28 : slot === 'b' ? .2 : .16,
    sheenColor,
    sheenRoughness: .8,
    clearcoat: slot === 'a' ? .03 : 0,
    clearcoatRoughness: .5,
  });
  material.userData.slot = slot;
  material.userData.recolorable = true;
  return material;
}

// 给同一部位的网格加一条很轻的纵向明暗/血色渐变，避免整根看起来是一块纯色。
function ensureVertexTint(THREE, geometry, baseY = 0, slot = '') {
  if (geometry.attributes.color) return;
  const position = geometry.attributes.position;
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(.001, maxY - minY);
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    const local = (py - minY) / span;
    const global = baseY + py;
    const t = clamp((global + 1.4) / 4.8, 0, 1);
    const shade = .84 + .18 * (t * t * (3 - 2 * t)) + .02 * local;
    const grainA = Math.sin(px * 17.3 + py * 9.1 + pz * 13.7) * .5 + .5;
    const grainB = Math.sin(px * 31.7 - py * 7.3 + pz * 23.1) * .5 + .5;
    let r = shade + (grainA - .5) * .035;
    let g = shade + (grainB - .5) * .03;
    let b = shade + (grainA - .5) * .025;
    if (slot === 'a') {
      const blush = (1 - local) * .075 + Math.exp(-Math.pow((local - .22) / .2, 2)) * .035;
      r += blush;
      g -= blush * .24;
      b -= blush * .32;
    } else if (slot === 'b') {
      const base = 1 - local;
      r += base * .012;
      g -= base * .02;
      b -= base * .024;
    } else if (slot === 'c') {
      const base = 1 - local;
      r -= base * .012;
      g -= base * .022;
      b -= base * .022;
    }
    colors[index * 3] = clamp(r, 0, 1);
    colors[index * 3 + 1] = clamp(g, 0, 1);
    colors[index * 3 + 2] = clamp(b, 0, 1);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// 沿法线做很轻的几何起伏：让轮廓和受光面出现真实皮肤的细小高低差。
function roughenGeometry(THREE, geometry, { amplitude = .008, frequency = 8, seed = 1, wrinkle = 0 } = {}) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return;
  const noise = createTileableNoise(seed);
  const vertex = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    n.fromBufferAttribute(normal, index).normalize();
    const u = Math.atan2(vertex.z, vertex.x) / (Math.PI * 2) + .5;
    const v = clamp(vertex.y / 4 + .5, 0, 1);
    let offset = (noise(u * frequency, v * frequency, frequency) - .5) * amplitude;
    if (wrinkle) offset += Math.sin((vertex.y * 10 + noise(u * 3, v * 3, 3) * 1.6) * Math.PI * 2) * wrinkle;
    vertex.addScaledVector(n, offset);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// 球体/车削体的 UV 接缝有重复顶点，把首尾法线取平均再写回，
// 避免接缝两侧分别按半边面计算法线，形成一条竖向亮线。
function copySeamNormals(geometry, segments) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return;
  const stride = segments + 1;
  if (position.count % stride !== 0) return;
  const rows = position.count / stride;
  for (let row = 0; row < rows; row += 1) {
    const first = row * stride;
    const last = first + segments;
    const x = (normal.getX(first) + normal.getX(last)) * .5;
    const y = (normal.getY(first) + normal.getY(last)) * .5;
    const z = (normal.getZ(first) + normal.getZ(last)) * .5;
    const length = Math.hypot(x, y, z) || 1;
    normal.setXYZ(first, x / length, y / length, z / length);
    normal.setXYZ(last, x / length, y / length, z / length);
  }
  normal.needsUpdate = true;
}

function materialSet(THREE, slot, color) {
  const main = skinMaterial(THREE, slot, color);
  const accent = new THREE.MeshStandardMaterial({ color: '#f3e5cf', roughness: .46, metalness: .02 });
  accent.userData.fixedColor = true;
  const dark = new THREE.MeshStandardMaterial({ color: '#241a16', roughness: .86 });
  dark.userData.fixedColor = true;
  return { main, accent, dark };
}

// 同色系的深浅材质，仍会跟随玩家改色。
function tinted(THREE, base, factor) {
  const material = base.clone();
  material.color.copy(base.color).multiplyScalar(factor);
  material.userData.slot = base.userData.slot;
  material.userData.recolorable = true;
  material.userData.shade = factor;
  return material;
}

function addMesh(THREE, group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  if (material.vertexColors) ensureVertexTint(THREE, geometry, position[1], material.userData.slot);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function addSpike(THREE, group, material, origin, direction, radius, height) {
  const normal = new THREE.Vector3(...direction).normalize();
  const geometry = new THREE.ConeGeometry(radius, height, 8);
  geometry.translate(0, height / 2, 0);
  if (material.vertexColors) ensureVertexTint(THREE, geometry, origin.y, material.userData.slot);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.add(mesh);
  return mesh;
}

function finGeometry(THREE, depth = .08, scale = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(.24 * scale, .22 * scale);
  shape.lineTo(.96 * scale, -.5 * scale);
  shape.lineTo(.28 * scale, -.48 * scale);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// ---------- 龟头 ----------

function addMushroomGlans(ctx) {
  const { THREE, group, main } = ctx;
  // 略细长的椭球：下半段直接埋进空心茎身，上半段露出来形成圆润头部。
  // 不再使用车削轮廓、外沿圆环或外部衔接曲面。
  const geometry = new THREE.SphereGeometry(1, 64, 48);
  roughenGeometry(THREE, geometry, { amplitude: .006, frequency: 10, seed: 11, wrinkle: .0008 });
  copySeamNormals(geometry, 64);
  const glans = addMesh(THREE, group, geometry, main, [0, GLANS_BASE, 0]);
  glans.scale.set(.47, .8, .47);
  // 椭球 UV 接缝会造成竖向亮线；这里改用顶点色斑驳 + 几何微起伏，
  // 不再给椭球贴 UV 纹理。
  glans.material.map = null;
  glans.material.roughnessMap = null;
  glans.material.bumpMap = null;
  glans.material.bumpScale = 0;
  glans.material.roughness = .42;
  glans.material.needsUpdate = true;
}

function buildGlans(ctx, id) {
  const { THREE, group, main, accent, dark } = ctx;

  if (id === 'a-cone') {
    addMesh(THREE, group, new THREE.ConeGeometry(0.68, 1.15, 40), main, [0, GLANS_BASE + 0.58, 0]);
    addMesh(THREE, group, new THREE.CylinderGeometry(0.52, 0.58, 0.12, 32), tinted(THREE, main, .9), [0, GLANS_BASE + 0.02, 0]);
    return;
  }
  if (id === 'a-sphere') {
    const sphere = addMesh(THREE, group, new THREE.SphereGeometry(0.77, 36, 28), main, [0, GLANS_BASE + 0.72, 0]);
    sphere.scale.y = 1.05;
    addMesh(THREE, group, new THREE.TorusGeometry(0.735, 0.026, 8, 48), accent, [0, GLANS_BASE + 0.08, 0], [Math.PI / 2, 0, 0]);
    addMesh(THREE, group, new THREE.CylinderGeometry(0.31, 0.37, 0.1, 32), tinted(THREE, main, .92), [0, GLANS_BASE - 0.03, 0]);
    return;
  }
  if (id === 'a-heart') {
    const heart = new THREE.Shape();
    heart.moveTo(0, -.8);
    heart.bezierCurveTo(-1.52, .1, -.64, 1.14, 0, .48);
    heart.bezierCurveTo(.64, 1.14, 1.52, .1, 0, -.8);
    const geometry = new THREE.ExtrudeGeometry(heart, {
      depth: .52, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelSize: .07, bevelThickness: .07, curveSegments: 24,
    });
    geometry.center();
    const mesh = addMesh(THREE, group, geometry, main, [0, GLANS_BASE + 0.68, 0]);
    mesh.scale.setScalar(.78);
    addMesh(THREE, group, new THREE.CylinderGeometry(0.28, 0.36, 0.12, 32), tinted(THREE, main, .92), [0, GLANS_BASE - 0.01, 0]);
    return;
  }
  if (id === 'a-hook') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, GLANS_BASE - 0.02, 0),
      new THREE.Vector3(0, GLANS_BASE + 0.42, 0.04),
      new THREE.Vector3(-0.13, GLANS_BASE + 0.82, 0.22),
      new THREE.Vector3(0.18, GLANS_BASE + 1.08, 0.5),
      new THREE.Vector3(0.62, GLANS_BASE + 0.96, 0.52),
      new THREE.Vector3(0.72, GLANS_BASE + 0.68, 0.3),
    ]);
    addMesh(THREE, group, new THREE.TubeGeometry(curve, 64, 0.21, 12, false), main);
    addMesh(THREE, group, new THREE.SphereGeometry(0.21, 24, 18), main, curve.getPoint(1).toArray());
    addMesh(THREE, group, new THREE.CylinderGeometry(0.3, 0.37, 0.1, 32), tinted(THREE, main, .92), [0, GLANS_BASE - 0.03, 0]);
    return;
  }
  if (id === 'a-face') {
    const head = addMesh(THREE, group, new THREE.SphereGeometry(0.63, 32, 24), tinted(THREE, main, 1.03), [0, GLANS_BASE + 0.72, 0]);
    head.scale.set(1, 1.08, .92);
    const mask = new THREE.Shape();
    mask.moveTo(-.65, .64); mask.lineTo(.65, .64); mask.lineTo(.77, -.25);
    mask.lineTo(.38, -.72); mask.lineTo(-.38, -.72); mask.lineTo(-.77, -.25); mask.closePath();
    const geometry = new THREE.ExtrudeGeometry(mask, {
      depth: .26, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 1,
    });
    geometry.center();
    const maskMesh = addMesh(THREE, group, geometry, tinted(THREE, main, 1.06), [0, GLANS_BASE + 0.76, 0.33]);
    maskMesh.scale.setScalar(.8);
    for (const x of [-0.22, 0.22]) {
      const eye = addMesh(THREE, group, new THREE.SphereGeometry(0.075, 16, 12), dark, [x, GLANS_BASE + 0.86, 0.56]);
      eye.scale.z = .45;
    }
    const nose = addMesh(THREE, group, new THREE.ConeGeometry(0.09, 0.3, 12), main, [0, GLANS_BASE + 0.74, 0.62], [Math.PI / 2, 0, 0]);
    nose.rotation.z = 0;
    addMesh(THREE, group, new THREE.BoxGeometry(.3, .05, .04), dark, [0, GLANS_BASE + 0.53, 0.6]);
    addMesh(THREE, group, new THREE.CylinderGeometry(0.27, 0.35, 0.14, 32), tinted(THREE, main, .92), [0, GLANS_BASE - 0.02, 0]);
    return;
  }
  if (id === 'a-rocket') {
    addMesh(THREE, group, new THREE.CylinderGeometry(.44, .5, .82, 32), main, [0, GLANS_BASE + 0.5, 0]);
    addMesh(THREE, group, new THREE.ConeGeometry(.5, .62, 32), main, [0, GLANS_BASE + 1.22, 0]);
    addMesh(THREE, group, new THREE.CylinderGeometry(.5, .5, .1, 32), tinted(THREE, main, .9), [0, GLANS_BASE + 0.02, 0]);
    const window = addMesh(THREE, group, new THREE.SphereGeometry(.13, 20, 14), accent, [0, GLANS_BASE + 0.56, .43]);
    window.scale.z = .45;
    for (let index = 0; index < 4; index += 1) {
      const fin = addMesh(THREE, group, finGeometry(THREE, .07, .82), main, [0, GLANS_BASE + 0.2, 0], [0, index * Math.PI / 2, 0]);
      fin.position.y = GLANS_BASE + 0.22;
    }
    return;
  }
  if (id === 'a-urchin') {
    addMesh(THREE, group, new THREE.SphereGeometry(.57, 28, 20), main, [0, GLANS_BASE + 0.72, 0]);
    const count = 42;
    for (let index = 0; index < count; index += 1) {
      const y = 1 - 2 * (index + .5) / count;
      const radius = Math.sqrt(1 - y * y);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const normal = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const origin = new THREE.Vector3(0, GLANS_BASE + 0.72, 0).addScaledVector(normal, .56);
      addSpike(THREE, group, main, origin, normal.toArray(), .085, .34);
    }
    addMesh(THREE, group, new THREE.CylinderGeometry(0.27, 0.35, 0.1, 32), tinted(THREE, main, .92), [0, GLANS_BASE - 0.03, 0]);
    return;
  }
  addMushroomGlans(ctx);
}

// ---------- 茎部 ----------

function addBaseShaft(ctx, hollow = false) {
  const { THREE, group, main } = ctx;
  if (hollow) {
    // 顶部开口的空心管：外壁、内壁、top rim 和封闭底一起车削出来。
    const outer = SHAFT_RADIUS;
    const inner = outer - .035;
    const top = SHAFT_TOP;
    const rimTop = top + .03;
    const bottom = SHAFT_BOTTOM;
    const profile = [
      [inner, rimTop],
      [inner, bottom + .08],
      [inner * .94, bottom + .02],
      [0, bottom],
      [outer * .94, bottom + .02],
      [outer, bottom + .1],
      [outer, top - .03],
      [outer + .014, top + .01],
      [outer + .014, rimTop],
      [inner, rimTop],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    const geometry = new THREE.LatheGeometry(profile, 64);
    roughenGeometry(THREE, geometry, { amplitude: .004, frequency: 9, seed: 21, wrinkle: .001 });
    copySeamNormals(geometry, 64);
    const mesh = addMesh(THREE, group, geometry, main);
    // 空心管的纵向 UV 接缝同样会造成竖条；默认管身改用顶点色斑驳。
    mesh.material.map = null;
    mesh.material.roughnessMap = null;
    mesh.material.bumpMap = null;
    mesh.material.bumpScale = 0;
    mesh.material.roughness = .55;
    mesh.material.needsUpdate = true;
    return mesh;
  }
  const height = SHAFT_TOP - SHAFT_BOTTOM;
  const geometry = new THREE.CapsuleGeometry(SHAFT_RADIUS, height - SHAFT_RADIUS * 2, 16, 48);
  roughenGeometry(THREE, geometry, { amplitude: .0045, frequency: 9, seed: 21, wrinkle: .0012 });
  return addMesh(THREE, group, geometry, main, [0, (SHAFT_TOP + SHAFT_BOTTOM) / 2, 0]);
}

function buildShaft(ctx, id) {
  const { THREE, group, main, accent, hollow } = ctx;

  if (id === 'b-spindle') {
    const profile = [
      [0.16, SHAFT_BOTTOM], [0.3, 0.28], [0.46, 0.72], [0.60, 1.35], [0.63, 1.7],
      [0.58, 2.2], [0.44, 2.8], [0.22, SHAFT_TOP],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    addMesh(THREE, group, new THREE.LatheGeometry(profile, 40), main);
    return;
  }

  if (id === 'b-spring') {
    const points = Array.from({ length: 260 }, (_, index) => {
      const t = index / 259;
      const angle = t * Math.PI * 2 * 8;
      return new THREE.Vector3(Math.cos(angle) * .48, .06 + t * 3.05, Math.sin(angle) * .48);
    });
    addMesh(THREE, group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 320, .115, 8, false), main);
    addMesh(THREE, group, new THREE.CylinderGeometry(.12, .12, 2.95, 18), tinted(THREE, main, .78), [0, 1.58, 0]);
    return;
  }

  addBaseShaft(ctx, hollow);

  if (id === 'b-veins') {
    const veinMaterial = tinted(THREE, main, .72);
    for (let index = 0; index < 6; index += 1) {
      const phase = index * Math.PI / 3;
      const points = [];
      for (let step = 0; step <= 12; step += 1) {
        const t = step / 12;
        const angle = phase + Math.sin(t * Math.PI * 2 + index) * .38;
        const radius = SHAFT_RADIUS + .012 + Math.sin(t * Math.PI) * .012;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          .3 + t * 2.6,
          Math.sin(angle) * radius,
        ));
      }
      addMesh(THREE, group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .032, 6, false), veinMaterial);
    }
    return;
  }

  if (id === 'b-texture') {
    const bumpMaterial = tinted(THREE, main, 1.14);
    for (let row = 0; row < 10; row += 1) {
      const y = .35 + row * .26;
      for (let column = 0; column < 8; column += 1) {
        const angle = column * Math.PI / 4 + (row % 2) * Math.PI / 8;
        const radius = SHAFT_RADIUS + .005;
        const size = .042 + ((row * 7 + column) % 3) * .008;
        addMesh(THREE, group, new THREE.SphereGeometry(size, 12, 8), bumpMaterial, [
          Math.cos(angle) * radius, y, Math.sin(angle) * radius,
        ]);
      }
    }
    return;
  }

  if (id === 'b-spikes') {
    for (let row = 0; row < 4; row += 1) {
      const y = .55 + row * .62;
      for (let column = 0; column < 8; column += 1) {
        const angle = column * Math.PI / 4 + (row % 2) * Math.PI / 8;
        const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const origin = new THREE.Vector3(normal.x * SHAFT_RADIUS, y, normal.z * SHAFT_RADIUS);
        addSpike(THREE, group, main, origin, normal.toArray(), .09, .3);
      }
    }
    return;
  }

  if (id === 'b-lettering') {
    const letterMaterial = accent;
    'NAMCHIEH'.split('').forEach((char, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = -0.36 + column * .24;
      const y = 2.92 - row * .5;
      for (const stroke of GLYPHS[char]) {
        for (let point = 1; point < stroke.length; point += 1) {
          const from = new THREE.Vector3(x + stroke[point - 1][0] * .16, y + stroke[point - 1][1] * .34, .468);
          const to = new THREE.Vector3(x + stroke[point][0] * .16, y + stroke[point][1] * .34, .468);
          const bar = addMesh(
            THREE,
            group,
            new THREE.CylinderGeometry(.012, .012, from.distanceTo(to), 6),
            letterMaterial,
            from.clone().add(to).multiplyScalar(.5).toArray(),
          );
          bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        }
      }
    });
    return;
  }
}

// ---------- 阴囊 ----------

function addBaseScrotum(ctx, radius = SCROTUM_RADIUS, y = SCROTUM_Y, x = SCROTUM_X) {
  const { THREE, group, main } = ctx;
  for (const side of [-1, 1]) {
    const geometry = new THREE.SphereGeometry(radius, 52, 36);
    roughenGeometry(THREE, geometry, { amplitude: .012, frequency: 10, seed: side > 0 ? 31 : 37, wrinkle: .005 });
    copySeamNormals(geometry, 52);
    const sphere = addMesh(THREE, group, geometry, main, [side * x, y, .02]);
    sphere.scale.set(1, .98, .92);
  }
  const bridgeGeometry = new THREE.SphereGeometry(radius * .62, 32, 24);
  roughenGeometry(THREE, bridgeGeometry, { amplitude: .008, frequency: 9, seed: 41, wrinkle: .003 });
  copySeamNormals(bridgeGeometry, 32);
  const bridge = addMesh(THREE, group, bridgeGeometry, main, [0, y + radius * .3, .02]);
  bridge.scale.set(1.12, .84, .92);
  // 阴囊正中缝：一条贴着前表面的细线，让两个球体之间不再只有硬相交。
  if (x === SCROTUM_X) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, y + radius * .55, .02 + radius * .55),
      new THREE.Vector3(0, y + radius * .18, .02 + radius * .74),
      new THREE.Vector3(0, y, .02 + radius * .78),
      new THREE.Vector3(0, y - radius * .35, .02 + radius * .62),
      new THREE.Vector3(0, y - radius * .55, .02 + radius * .53),
    ]);
    addMesh(THREE, group, new THREE.TubeGeometry(curve, 30, .011 * (radius / SCROTUM_RADIUS), 6, false), tinted(THREE, main, .78));
  }
}

function addHair(ctx, count, length, radius) {
  const { THREE, group, dark } = ctx;
  const centers = [
    new THREE.Vector3(-SCROTUM_X, SCROTUM_Y, .02),
    new THREE.Vector3(SCROTUM_X, SCROTUM_Y, .02),
  ];
  let placed = 0;
  for (let index = 0; placed < count && index < count * 8; index += 1) {
    const center = centers[index % 2];
    const phi = Math.acos(1 - 2 * ((index * .61803398875) % 1));
    const theta = index * 2.399963;
    const normal = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    if (normal.y > .32) continue;
    const geometry = new THREE.ConeGeometry(radius, length, 5);
    geometry.translate(0, length / 2, 0);
    const mesh = new THREE.Mesh(geometry, dark);
    mesh.position.copy(center).addScaledVector(normal, SCROTUM_RADIUS * .97);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    group.add(mesh);
    placed += 1;
  }
}

function buildScrotum(ctx, id) {
  const { THREE, group, main } = ctx;

  if (id === 'c-huge') {
    addBaseScrotum(ctx, 1.0, -.78, .72);
    return;
  }

  addBaseScrotum(ctx);

  if (id === 'c-sparse') {
    addHair(ctx, 16, .17, .024);
    return;
  }
  if (id === 'c-fluffy') {
    addHair(ctx, 42, .23, .028);
    return;
  }
  if (id === 'c-lush') {
    addHair(ctx, 88, .31, .032);
    return;
  }
  if (id === 'c-fins') {
    for (let index = 0; index < 4; index += 1) {
      addMesh(THREE, group, finGeometry(THREE, .07, 1.55), main, [0, SCROTUM_Y - .05, 0], [0, index * Math.PI / 2, 0]);
    }
    return;
  }
}

export function buildPartModel(THREE, slot, id, color, options = {}) {
  slot = validSlot(slot) ? slot : 'a';
  id = hasCosmeticModel(id, slot) ? id : '';
  const group = new THREE.Group();
  const materials = materialSet(THREE, slot, color);
  const context = { THREE, group, hollow: options.hollow === true, ...materials };
  if (slot === 'a') buildGlans(context, id);
  else if (slot === 'b') {
    buildShaft(context, id);
    // 茎部根端的连接球，让柱身和阴囊之间不出现生硬的空隙。
    const root = addMesh(THREE, group, new THREE.SphereGeometry(.3, 24, 18), materials.main, [0, -0.04, 0]);
    root.scale.set(1.15, .8, 1.05);
  } else buildScrotum(context, id);
  group.userData.slot = slot;
  group.userData.cosmeticId = id || 'base';
  return group;
}

// ---------- 渐变过渡曲面 ----------
// 两段曲面用顶点色把相邻部位的颜色平滑混在一起；材质仍吃同一套皮肤凹凸纹理。
function buildBlendGeometry(THREE, { segments = 72, rows = 26, y0, y1, radiusAt, lobeAt = null, bulge = 0 }) {
  const positions = [], uvs = [], colors = [], indices = [], tValues = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const y = y0 + (y1 - y0) * t + bulge * Math.sin(Math.PI * t);
    const radius = radiusAt(t);
    const lobe = lobeAt ? lobeAt(t) : 0;
    for (let column = 0; column <= segments; column += 1) {
      const angle = column / segments * Math.PI * 2;
      const r = radius * (1 + lobe * (.1 * Math.cos(2 * angle) + .035 * Math.cos(4 * angle)));
      positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
      uvs.push(column / segments, t);
      colors.push(1, 1, 1);
      tValues.push(t);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 接缝两侧是重复顶点，把法线抄过去，避免一条亮线。
  const normals = geometry.attributes.normal;
  for (let row = 0; row <= rows; row += 1) {
    const first = row * (segments + 1);
    const last = first + segments;
    normals.setXYZ(last, normals.getX(first), normals.getY(first), normals.getZ(first));
  }
  normals.needsUpdate = true;
  return { geometry, tValues };
}

function createBlendMesh(THREE, {
  fromSlot, toSlot, palette, y0, y1, radiusAt, lobeAt = null, bulge = 0,
  blush = 0, crease = 0, textureSlot, bumpScale,
}) {
  const textures = createSkinTextures(THREE, textureSlot || toSlot);
  const sheenColor = new THREE.Color(safeColor(palette[fromSlot], DEFAULT_COLORS[fromSlot]))
    .lerp(new THREE.Color(safeColor(palette[toSlot], DEFAULT_COLORS[toSlot])), .5)
    .lerp(new THREE.Color('#ffe6d5'), .5);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    bumpMap: textures.bumpMap,
    bumpScale,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    sheen: .2,
    sheenColor,
    sheenRoughness: .8,
  });
  const { geometry, tValues } = buildBlendGeometry(THREE, { y0, y1, radiusAt, lobeAt, bulge });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.blend = `${fromSlot}-${toSlot}`;
  mesh.userData.updateGradient = colors => {
    const from = new THREE.Color(safeColor(colors[fromSlot], DEFAULT_COLORS[fromSlot]));
    const to = new THREE.Color(safeColor(colors[toSlot], DEFAULT_COLORS[toSlot]));
    const temp = new THREE.Color();
    const attribute = geometry.attributes.color;
    for (let index = 0; index < tValues.length; index += 1) {
      const t = tValues[index];
      const smooth = t * t * (3 - 2 * t);
      temp.copy(from).lerp(to, smooth);
      if (crease) temp.multiplyScalar(1 - Math.exp(-Math.pow((t - .07) / .11, 2)) * crease);
      if (blush) {
        const k = Math.exp(-Math.pow((t - .78) / .14, 2)) * blush;
        temp.r = Math.min(1, temp.r + k * .55);
        temp.g = Math.max(0, temp.g - k * .22);
        temp.b = Math.max(0, temp.b - k * .26);
      }
      attribute.setXYZ(index, temp.r, temp.g, temp.b);
    }
    attribute.needsUpdate = true;
    material.sheenColor.copy(from).lerp(to, .5).lerp({ r: 1, g: .9, b: .84 }, .5);
  };
  mesh.userData.updateGradient(palette);
  return mesh;
}

function buildRootBlend(THREE, palette) {
  return createBlendMesh(THREE, {
    fromSlot: 'c',
    toSlot: 'b',
    palette,
    y0: -.32,
    y1: .56,
    radiusAt: t => {
      const smooth = t * t * (3 - 2 * t);
      return .575 + (.455 - .575) * smooth + .022 * Math.sin(Math.PI * t);
    },
    lobeAt: t => Math.pow(1 - t, 2.6) * .8,
    crease: .065,
    textureSlot: 'c',
    bumpScale: .04,
  });
}

function buildFrenulum(THREE, palette) {
  const material = skinMaterial(THREE, 'b', palette.b);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 3.03, .46),
    new THREE.Vector3(0, 2.94, .487),
    new THREE.Vector3(0, 2.82, .482),
    new THREE.Vector3(0, 2.72, .466),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 28, .017, 7, false);
  ensureVertexTint(THREE, geometry, 0, 'b');
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.frenulum = true;
  return mesh;
}

// ---------- 参考 Blender 模型的连续剖面移植 ----------
// 参考模型是一整条连续曲面：茎身 → 冠状沟 → 冠状缘 → 龟头 → 尿道口浅凹，
// 用 PCHIP 插值保证冠状缘不过冲，并带腹侧系带微调。这里按米制剖面原样移植。
const REF_CONTROLS = Object.freeze([
  [0.000, .0164, .0145], [0.002, .0165, .0146],
  [0.010, .0158, .0140], [0.028, .0147, .0131],
  [0.055, .0140, .0125], [0.082, .0138, .0121],
  [0.100, .0135, .0118], [0.107, .0130, .0114],
  [0.110, .0128, .0111], [0.112, .0125, .0108],
  [0.1134, .0127, .0110], [0.1145, .0157, .0134],
  [0.1158, .0170, .0142], [0.1175, .0172, .0144],
  [0.1200, .0168, .0142], [0.126, .0155, .0134],
  [0.132, .0144, .0129], [0.138, .0123, .0114],
  [0.143, .0095, .0091], [0.1465, .0066, .0066],
  [0.1485, .0040, .0048], [0.1494, .0019, .0033],
  [0.14965, .00065, .00235],
]);
const REF_SHAFT_Z = 0.113;
const REF_TOTAL_Z = 0.14965;
const REF_SHAFT_R = 0.0135;

function pchipSlopes(zs, rs) {
  const h = [], d = [];
  for (let i = 0; i < zs.length - 1; i += 1) {
    h.push(zs[i + 1] - zs[i]);
    d.push((rs[i + 1] - rs[i]) / h[i]);
  }
  const m = [d[0]];
  for (let i = 1; i < zs.length - 1; i += 1) {
    if (d[i - 1] * d[i] <= 0) m.push(0);
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
    }
  }
  m.push(d[d.length - 1]);
  return m;
}

function sampleRefProfile(step = 0.0012) {
  const zs = REF_CONTROLS.map(c => c[0]);
  const rx = REF_CONTROLS.map(c => c[1]);
  const ry = REF_CONTROLS.map(c => c[2]);
  const mx = pchipSlopes(zs, rx), my = pchipSlopes(zs, ry);
  const rings = [];
  for (let k = 0; k < zs.length - 1; k += 1) {
    const h = zs[k + 1] - zs[k];
    const steps = Math.max(2, Math.ceil(h / step));
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      const h00 = 2 * t * t * t - 3 * t * t + 1, h10 = t * t * t - 2 * t * t + t;
      const h01 = -2 * t * t * t + 3 * t * t, h11 = t * t * t - t * t;
      const x = h00 * rx[k] + h10 * h * mx[k] + h01 * rx[k + 1] + h11 * h * mx[k + 1];
      const y = h00 * ry[k] + h10 * h * my[k] + h01 * ry[k + 1] + h11 * h * my[k + 1];
      rings.push([zs[k] + t * h, x, y]);
    }
  }
  rings.push(REF_CONTROLS[REF_CONTROLS.length - 1]);
  return rings;
}

function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

// 默认款：一条连续曲面同时包含茎身与龟头，冠状沟/冠状缘/龟头/尿道口都在一条曲面上。
function buildContinuousAnatomy(THREE, palette, diameterScale, lengthScale) {
  const segments = 72;
  const rings = sampleRefProfile(0.0012);
  const rows = rings.length;
  const radiusFactor = (SHAFT_RADIUS / REF_SHAFT_R) * diameterScale;
  const shaftTopY = SHAFT_TOP * lengthScale;
  const glansHeight = (REF_TOTAL_Z - REF_SHAFT_Z) / REF_SHAFT_Z * SHAFT_TOP * diameterScale;

  const positions = [], uvs = [], colors = [], indices = [], blendTs = [], shades = [];
  const shaftColor = new THREE.Color(safeColor(palette.b, DEFAULT_COLORS.b));
  const glansColor = new THREE.Color(safeColor(palette.a, DEFAULT_COLORS.a));
  const stride = segments + 1;

  for (let r = 0; r < rows; r += 1) {
    const [z, rx, ry] = rings[r];
    const y = z <= REF_SHAFT_Z
      ? z / REF_SHAFT_Z * shaftTopY
      : shaftTopY + (z - REF_SHAFT_Z) / (REF_TOTAL_Z - REF_SHAFT_Z) * glansHeight;
    const centerZ = -0.0065 * smooth01(z / REF_TOTAL_Z) * radiusFactor;
    const blendT = smooth01((z - 0.106) / (0.122 - 0.106));
    const shade = .9 + .1 * smooth01(z / REF_TOTAL_Z * .85 + .1);
    for (let s = 0; s <= segments; s += 1) {
      const theta = s / segments * Math.PI * 2;
      const ventral = Math.pow(Math.max(0, -Math.sin(theta)), 8);
      const neckMask = Math.exp(-Math.pow((z - 0.115) / 0.0065, 2));
      const radialMod = 1 - .13 * neckMask * ventral;
      const X = rx * radiusFactor * Math.cos(theta) * radialMod;
      let Z = ry * radiusFactor * Math.sin(theta) * radialMod + centerZ;
      if (z > 0.012 && z < 0.108) {
        const m = Math.sin(Math.PI * (z - 0.012) / 0.096);
        Z -= 0.00017 * ventral * m * m * radiusFactor;
      }
      const Y = y + 0.0015 * neckMask * ventral * radiusFactor;
      positions.push(X, Y, Z);
      uvs.push(s / segments, z / REF_TOTAL_Z);
      colors.push(1, 1, 1);
      blendTs.push(blendT);
      shades.push(shade);
    }
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = r * stride + s, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  copySeamNormals(geometry, segments);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: .58,
    metalness: 0,
    sheen: .18,
    sheenColor: new THREE.Color('#f2d9c8'),
    sheenRoughness: .85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.anatomyCore = true;
  mesh.userData.updateGradient = colors => {
    const from = new THREE.Color(safeColor(colors.b, DEFAULT_COLORS.b));
    const to = new THREE.Color(safeColor(colors.a, DEFAULT_COLORS.a));
    const attr = geometry.attributes.color;
    for (let i = 0; i < blendTs.length; i += 1) {
      const t = blendTs[i];
      const px = geometry.attributes.position.getX(i);
      const py = geometry.attributes.position.getY(i);
      const pz = geometry.attributes.position.getZ(i);
      const grainA = Math.sin(px * 17.3 + py * 9.1 + pz * 13.7) * .5 + .5;
      const grainB = Math.sin(px * 31.7 - py * 7.3 + pz * 23.1) * .5 + .5;
      const temp = new THREE.Color().copy(from).lerp(to, t);
      temp.r *= shades[i] + (grainA - .5) * .035;
      temp.g *= shades[i] + (grainB - .5) * .03;
      temp.b *= shades[i] + (grainA - .5) * .025;
      attr.setXYZ(i, temp.r, temp.g, temp.b);
    }
    attr.needsUpdate = true;
    material.sheenColor.copy(from).lerp(to, .5).lerp({ r: 1, g: .9, b: .84 }, .5);
  };
  mesh.userData.updateGradient(palette);

  const tipY = shaftTopY + glansHeight;
  const meatus = new THREE.Mesh(
    new THREE.SphereGeometry(.014 * diameterScale, 12, 8),
    new THREE.MeshStandardMaterial({ color: '#2a1713', roughness: .9 }),
  );
  meatus.position.set(0, tipY - .02 * diameterScale, .02 * diameterScale);
  meatus.scale.set(.7, 1.4, .5);

  const group = new THREE.Group();
  group.add(mesh, meatus);
  group.userData.anatomyCore = true;
  return { group, shaftTopY, glansHeight };
}

// 组合成一根完整的牛子：阴囊在下，茎身+龟头在上。
// 默认款用一整条连续曲面；有茎身/龟头装饰时退回独立部件路径。
export function buildAnatomyModel(THREE, profile, colors = {}) {
  const palette = { ...DEFAULT_COLORS, ...(profile?.colors || {}), ...(colors || {}) };
  const diameterScale = clamp((Number(profile?.diameter) || 3.5) / 3.5, .45, 2.6);
  const lengthScale = clamp((Number(profile?.length) || 12) / 12, .45, 2.8);
  const hasShaftCosmetic = hasCosmeticModel(profile?.equipped?.b, 'b');
  const hasGlansCosmetic = hasCosmeticModel(profile?.equipped?.a, 'a');

  const scrotum = buildPartModel(THREE, 'c', profile?.equipped?.c, palette.c);
  scrotum.scale.set(diameterScale, diameterScale, diameterScale);

  const rootBlend = buildRootBlend(THREE, palette);
  rootBlend.scale.set(diameterScale, Math.sqrt(diameterScale * lengthScale), diameterScale);

  const anatomy = new THREE.Group();
  anatomy.add(scrotum, rootBlend);

  let continuous = false;
  let shaftTopY = SHAFT_TOP * lengthScale;
  let glansHeight = 0;
  if (!hasShaftCosmetic && !hasGlansCosmetic) {
    const core = buildContinuousAnatomy(THREE, palette, diameterScale, lengthScale);
    anatomy.add(core.group);
    continuous = true;
    shaftTopY = core.shaftTopY;
    glansHeight = core.glansHeight;
  } else {
    const shaft = buildPartModel(THREE, 'b', profile?.equipped?.b, palette.b);
    shaft.scale.set(diameterScale, lengthScale, diameterScale);
    const glans = buildPartModel(THREE, 'a', profile?.equipped?.a, palette.a);
    glans.scale.set(diameterScale, diameterScale, diameterScale);
    const overlap = Math.min(.18 * diameterScale, .22 * lengthScale);
    const contactY = shaftTopY - (hasGlansCosmetic ? overlap : 0);
    glans.position.y = contactY - GLANS_BASE * diameterScale;
    const frenulum = buildFrenulum(THREE, palette);
    frenulum.scale.set(diameterScale, lengthScale, diameterScale);
    frenulum.position.y = contactY - GLANS_BASE * lengthScale;
    anatomy.add(shaft, glans, frenulum);
  }

  anatomy.userData = { diameterScale, lengthScale, continuous, shaftTopY, glansHeight };
  const group = new THREE.Group();
  group.add(anatomy);
  group.userData.anatomy = anatomy;
  return group;
}

// ---------- SVG 缩略图与 WebGL 失败降级 ----------

function svgHeader(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" role="img" aria-label="${label}">`;
}

export function cosmeticThumbnail(slot, id, color = null) {
  slot = validSlot(slot) ? slot : 'a';
  id = hasCosmeticModel(id, slot) ? id : '';
  color = safeColor(color, DEFAULT_COLORS[slot]);
  const circle = (r = 42, cx = 100, cy = 86) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const column = '<path d="M73 44c0-13 54-13 54 0v88c0 13-54 13-54 0Z"/><ellipse cx="100" cy="44" rx="27" ry="10" fill="#fff" opacity=".22"/>';
  let shape = slot === 'b' ? column : circle();
  let label = slot === 'a' ? '蘑菇头' : slot === 'b' ? '柱身' : '双球底座';

  if (slot === 'a') {
    if (id === 'a-cone') { shape = '<path d="M100 28 53 131Q100 154 147 131Z"/>'; label = '圆锥形'; }
    if (id === 'a-sphere') { shape = `${circle(46)}<ellipse cx="100" cy="86" rx="46" ry="12" fill="none" stroke="#f3e5cf"/>`; label = '圆球形'; }
    if (id === 'a-heart') { shape = '<path d="M100 139C-4 80 64 11 100 56c36-45 104 24 0 83Z"/>'; label = '爱心形'; }
    if (id === 'a-hook') { shape = '<path d="M75 139V82c0-69 78-67 78-22 0 25-25 36-36 17" fill="none" stroke-width="22" stroke-linecap="round"/>'; label = '弯钩形'; }
    if (id === 'a-face') { shape = '<path d="M62 42h76l9 65-25 32H78l-25-32Z"/><path d="M67 72h24v12H67zm42 0h24v12h-24z" fill="#241a16" stroke="none"/><path d="M80 115h40M100 89v14" fill="none" stroke="#f3e5cf" stroke-width="5"/>'; label = '立体人面形'; }
    if (id === 'a-rocket') { shape = '<path d="m78 92-26 49 27-9m42-40 26 49-27-9"/><path d="M78 70 100 27l22 43v66H78Z"/><circle cx="100" cy="86" r="10" fill="#f3e5cf"/><path d="M85 143h30" stroke-width="8"/>'; label = '火箭头形'; }
    if (id === 'a-urchin') {
      shape = Array.from({ length: 16 }, (_, i) => {
        const a = i * Math.PI / 8;
        return `<path d="M${100 + Math.cos(a - .13) * 32} ${86 + Math.sin(a - .13) * 32}  ${100 + Math.cos(a) * 61} ${86 + Math.sin(a) * 61}  ${100 + Math.cos(a + .13) * 32} ${86 + Math.sin(a + .13) * 32}Z"/>`;
      }).join('') + circle(33);
      label = '海胆刺球形';
    }
  }

  if (slot === 'b') {
    if (id === 'b-spindle') { shape = '<path d="M100 25C86 41 58 65 58 88s28 47 42 62c14-15 42-39 42-62s-28-47-42-63Z"/>'; label = '纺锤形'; }
    if (id === 'b-veins') {
      shape = column + '<g fill="none" stroke="#f3e5cf" stroke-width="3" stroke-linecap="round"><path d="M83 50c14 22-8 31 4 48s-5 29 6 43"/><path d="M112 48c-12 18 9 32-2 48s6 28-4 45"/><path d="M95 55c9 19-6 32 3 48"/></g>';
      label = '青筋凸起形';
    }
    if (id === 'b-texture') {
      shape = column + Array.from({ length: 26 }, (_, i) => {
        const x = 82 + (i % 5) * 9 + (Math.floor(i / 5) % 2) * 4;
        const y = 54 + Math.floor(i / 5) * 14;
        return `<circle cx="${x}" cy="${y}" r="3.2" fill="#f3e5cf" stroke="none"/>`;
      }).join('');
      label = '疱疹遍布形';
    }
    if (id === 'b-spikes') { shape = column + [54, 78, 102, 126].map(y => `<path d="m74 ${y - 6}-20 6 20 7m52-13 20 6-20 7"/>`).join(''); label = '狼牙棒形'; }
    if (id === 'b-spring') { shape = `<path d="M73 34${Array.from({ length: 6 }, () => 'c80 5 80 15 0 20').join('')}" fill="none" stroke-width="11" stroke-linecap="round"/>`; label = '弹簧形'; }
    if (id === 'b-lettering') {
      shape = column + '<g fill="none" stroke="#f3e5cf" stroke-width="2">' + 'NAMCHIEH'.split('').map((char, index) => GLYPHS[char].map(stroke => `<path d="${stroke.map(([x, y], point) => `${point ? 'L' : 'M'}${76 + index % 4 * 13 + x * 9} ${88 + Math.floor(index / 4) * 25 - y * 16}`).join('')}"/>`).join('')).join('') + '</g>';
      label = '铭文NAMCHIEH形';
    }
  }

  if (slot === 'c') {
    if (id === 'c-sparse' || id === 'c-fluffy' || id === 'c-lush') {
      const count = id === 'c-sparse' ? 10 : id === 'c-fluffy' ? 24 : 46;
      const hair = Array.from({ length: count }, (_, i) => {
        const angle = i * 2.399963;
        const radius = 29 + (i % 5) * 2;
        const x = 100 + Math.cos(angle) * radius;
        const y = 103 + Math.sin(angle) * radius * .7;
        const length = id === 'c-lush' ? 17 : id === 'c-fluffy' ? 13 : 9;
        return `<path d="M${x} ${y}l${Math.cos(angle) * length} ${Math.sin(angle) * length}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      }).join('');
      shape = circle(43) + hair;
      label = id === 'c-sparse' ? '黑毛稀疏形' : id === 'c-fluffy' ? '黑毛茸茸形' : '黑毛葱茏形';
    }
    if (id === 'c-fins') { shape = '<path d="M72 75 37 136l43-9m48-52 35 61-43-9M89 70 100 30l11 40"/>' + circle(37); label = '火箭尾翼形'; }
    if (id === 'c-huge') { shape = circle(62); label = '超级巨大形'; }
  }

  return `${svgHeader(label)}<ellipse cx="100" cy="158" rx="49" ry="6" fill="#183e32" opacity=".12"/><g fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round">${shape}</g></svg>`;
}

// 侧视解剖示意图，用于 WebGL 不可用时的完整降级展示。
export function anatomySvg(profile, colors = {}) {
  const palette = { ...DEFAULT_COLORS, ...(profile?.colors || {}), ...(colors || {}) };
  const lengthScale = clamp((Number(profile?.length) || 12) / 12, .55, 1.85);
  const diameterScale = clamp((Number(profile?.diameter) || 3.5) / 3.5, .55, 1.75);
  const glansId = hasCosmeticModel(profile?.equipped?.a, 'a') ? profile.equipped.a : '';
  const shaftId = hasCosmeticModel(profile?.equipped?.b, 'b') ? profile.equipped.b : '';
  const scrotumId = hasCosmeticModel(profile?.equipped?.c, 'c') ? profile.equipped.c : '';
  const cx = 120;
  const baseY = 262;
  const shaftHeight = 108 * lengthScale;
  const shaftWidth = 34 * diameterScale;
  const shaftTop = baseY - shaftHeight;
  const glansHeight = 44 * diameterScale;
  const glansWidth = 52 * diameterScale;
  const scrotumRadius = 33 * diameterScale;

  let glans = `<path d="M${cx - glansWidth * .34} ${shaftTop} Q${cx - glansWidth * .72} ${shaftTop - glansHeight * .42} ${cx - glansWidth * .28} ${shaftTop - glansHeight * .78} Q${cx} ${shaftTop - glansHeight * 1.08} ${cx + glansWidth * .28} ${shaftTop - glansHeight * .78} Q${cx + glansWidth * .72} ${shaftTop - glansHeight * .42} ${cx + glansWidth * .34} ${shaftTop}Z" fill="${palette.a}"/>`;
  if (glansId === 'a-cone') glans = `<path d="M${cx - glansWidth * .48} ${shaftTop} L${cx} ${shaftTop - glansHeight * 1.15} L${cx + glansWidth * .48} ${shaftTop}Z" fill="${palette.a}"/>`;
  if (glansId === 'a-sphere') glans = `<circle cx="${cx}" cy="${shaftTop - glansHeight * .48}" r="${glansWidth * .56}" fill="${palette.a}"/>`;
  if (glansId === 'a-heart') glans = `<path d="M${cx} ${shaftTop - glansHeight * .18} C${cx - glansWidth * .9} ${shaftTop - glansHeight * .56} ${cx - glansWidth * .5} ${shaftTop - glansHeight * 1.28} ${cx} ${shaftTop - glansHeight * .84} C${cx + glansWidth * .5} ${shaftTop - glansHeight * 1.28} ${cx + glansWidth * .9} ${shaftTop - glansHeight * .56} ${cx} ${shaftTop - glansHeight * .18}Z" fill="${palette.a}"/>`;
  if (glansId === 'a-hook') glans = `<path d="M${cx - 12} ${shaftTop} Q${cx - 12} ${shaftTop - glansHeight * .9} ${cx + 20} ${shaftTop - glansHeight * .85} Q${cx + 44} ${shaftTop - glansHeight * .55} ${cx + 20} ${shaftTop - glansHeight * .28}" fill="none" stroke="${palette.a}" stroke-width="${18 * diameterScale}" stroke-linecap="round"/>`;
  if (glansId === 'a-face') glans = `<circle cx="${cx}" cy="${shaftTop - glansHeight * .5}" r="${glansWidth * .55}" fill="${palette.a}"/><circle cx="${cx - 10}" cy="${shaftTop - glansHeight * .6}" r="3" fill="#241a16"/><circle cx="${cx + 10}" cy="${shaftTop - glansHeight * .6}" r="3" fill="#241a16"/><path d="M${cx - 10} ${shaftTop - glansHeight * .35}q10 8 20 0" fill="none" stroke="#241a16" stroke-width="3"/>`;
  if (glansId === 'a-rocket') glans = `<path d="M${cx - glansWidth * .38} ${shaftTop} L${cx} ${shaftTop - glansHeight * 1.3} L${cx + glansWidth * .38} ${shaftTop}Z" fill="${palette.a}"/><path d="m${cx - glansWidth * .38} ${shaftTop} -18 24 18-5m${glansWidth * .38} -19 18 24-18-5" fill="${palette.c}" stroke="${palette.c}"/>`;
  if (glansId === 'a-urchin') {
    const spikes = Array.from({ length: 18 }, (_, i) => {
      const a = i * Math.PI / 9;
      const r = glansWidth * .56;
      return `<path d="M${cx + Math.cos(a - .12) * r} ${shaftTop - glansHeight * .5 + Math.sin(a - .12) * r} L${cx + Math.cos(a) * (r + 15)} ${shaftTop - glansHeight * .5 + Math.sin(a) * (r + 15)} L${cx + Math.cos(a + .12) * r} ${shaftTop - glansHeight * .5 + Math.sin(a + .12) * r}Z" fill="${palette.a}"/>`;
    }).join('');
    glans = spikes + `<circle cx="${cx}" cy="${shaftTop - glansHeight * .5}" r="${glansWidth * .52}" fill="${palette.a}"/>`;
  }

  let shaft = `<rect x="${cx - shaftWidth / 2}" y="${shaftTop}" width="${shaftWidth}" height="${shaftHeight + 16}" rx="${shaftWidth / 2}" fill="${palette.b}"/>`;
  if (shaftId === 'b-spindle') shaft = `<path d="M${cx - 4} ${shaftTop} C${cx - shaftWidth * .9} ${shaftTop + shaftHeight * .25} ${cx - shaftWidth * .9} ${baseY - shaftHeight * .2} ${cx - 4} ${baseY + 12} L${cx + 4} ${baseY + 12} C${cx + shaftWidth * .9} ${baseY - shaftHeight * .2} ${cx + shaftWidth * .9} ${shaftTop + shaftHeight * .25} ${cx + 4} ${shaftTop}Z" fill="${palette.b}"/>`;
  if (shaftId === 'b-veins') shaft += `<g fill="none" stroke="${palette.c}" stroke-width="3" stroke-linecap="round"><path d="M${cx - 8} ${shaftTop + 15}c12 22-8 31 3 48s-5 29 5 42"/><path d="M${cx + 10} ${shaftTop + 12}c-10 18 8 30-1 46s6 28-3 43"/></g>`;
  if (shaftId === 'b-texture') shaft += Array.from({ length: 30 }, (_, i) => {
    const x = cx - shaftWidth * .32 + (i % 5) * (shaftWidth * .16) + (Math.floor(i / 5) % 2) * 3;
    const y = shaftTop + 18 + Math.floor(i / 5) * 17;
    return `<circle cx="${x}" cy="${y}" r="2.2" fill="${palette.a}"/>`;
  }).join('');
  if (shaftId === 'b-spikes') shaft += [0, 1, 2, 3].map(row => {
    const y = shaftTop + 22 + row * 24;
    return `<path d="m${cx - shaftWidth / 2} ${y} -13 -4 11 10m${shaftWidth} -6 13 -4-11 10" fill="${palette.b}" stroke="${palette.b}"/>`;
  }).join('');
  if (shaftId === 'b-spring') shaft = `<path d="M${cx - shaftWidth / 2} ${shaftTop + 12}${Array.from({ length: 7 }, () => `c${shaftWidth * 1.2} 10-${shaftWidth * 1.2} 20 0 30`).join('')}" fill="none" stroke="${palette.b}" stroke-width="${8 * diameterScale}" stroke-linecap="round"/>`;
  if (shaftId === 'b-lettering') shaft += `<g fill="none" stroke="#f3e5cf" stroke-width="2">${'NAMCHIEH'.split('').map((char, index) => GLYPHS[char].map(stroke => `<path d="${stroke.map(([x, y], point) => `${point ? 'L' : 'M'}${cx - 22 + index % 4 * 12 + x * 8} ${shaftTop + 34 + Math.floor(index / 4) * 32 - y * 15}`).join('')}"/>`).join('')).join('')}</g>`;

  let scrotum = `<circle cx="${cx - scrotumRadius * .72}" cy="${baseY + scrotumRadius * .55}" r="${scrotumRadius}" fill="${palette.c}"/><circle cx="${cx + scrotumRadius * .72}" cy="${baseY + scrotumRadius * .55}" r="${scrotumRadius}" fill="${palette.c}"/><ellipse cx="${cx}" cy="${baseY + scrotumRadius * .15}" rx="${scrotumRadius * .9}" ry="${scrotumRadius * .55}" fill="${palette.c}"/>`;
  if (scrotumId === 'c-huge') scrotum = `<circle cx="${cx - scrotumRadius * 1.02}" cy="${baseY + scrotumRadius * .6}" r="${scrotumRadius * 1.36}" fill="${palette.c}"/><circle cx="${cx + scrotumRadius * 1.02}" cy="${baseY + scrotumRadius * .6}" r="${scrotumRadius * 1.36}" fill="${palette.c}"/><ellipse cx="${cx}" cy="${baseY + scrotumRadius * .18}" rx="${scrotumRadius * 1.15}" ry="${scrotumRadius * .7}" fill="${palette.c}"/>`;
  if (scrotumId === 'c-sparse' || scrotumId === 'c-fluffy' || scrotumId === 'c-lush') {
    const count = scrotumId === 'c-sparse' ? 12 : scrotumId === 'c-fluffy' ? 30 : 60;
    const hair = Array.from({ length: count }, (_, i) => {
      const angle = i * 2.399963;
      const radius = scrotumRadius * (1 + (i % 4) * .08);
      const x = cx + Math.cos(angle) * radius;
      const y = baseY + scrotumRadius * .55 + Math.sin(angle) * radius * .7;
      const length = scrotumId === 'c-lush' ? 15 : scrotumId === 'c-fluffy' ? 11 : 8;
      return `<path d="M${x} ${y}l${Math.cos(angle) * length} ${Math.sin(angle) * length}" stroke="#241a16" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    }).join('');
    scrotum += hair;
  }
  if (scrotumId === 'c-fins') scrotum += `<path d="m${cx - scrotumRadius * 1.4} ${baseY + scrotumRadius * .7} -30 40 34-9m${scrotumRadius * 2.8 - 4} -31 30 40-34-9" fill="${palette.c}" stroke="${palette.c}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340" role="img" aria-label="牛子3D模型预览"><ellipse cx="120" cy="316" rx="74" ry="12" fill="#4b5f3c" opacity=".16"/><ellipse cx="120" cy="310" rx="58" ry="8" fill="#f7f4e8"/><g stroke="#183e32" stroke-width="1" stroke-linejoin="round">${scrotum}${shaft}${glans}</g></svg>`;
}
