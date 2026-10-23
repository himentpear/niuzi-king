import { buildAnatomyModel, anatomySvg, DEFAULT_COLORS, disposeModel } from './cosmetics.js';

export { disposeModel };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

function disposeObject(object) {
  const resources = new Set();
  object?.traverse(node => {
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

// ==========================================================================
// ==========================================================================
// ==========================================================================
// ==========================================================================
// 牛子可运动骨骼与动力学动画引擎 (Procedural Fighter Mechanics Rig)
// 支持：拳击抱架律动(idle)、寸劲刺击(jab)、泰山压顶(heavy)、疾风连刺(flurry)、
//      海绵体硬化(guard)、充血超载(buff)、受击弹簧暴震(hit)、KO倒地(ko)、胜利加冕(victory)
// ==========================================================================
function createAnimatedRig(THREE, modelGroup, side = 'solo') {
  const box = new THREE.Box3().setFromObject(modelGroup);
  const minY = box.min.y;
  const maxY = box.max.y;
  const totalHeight = Math.max(0.5, maxY - minY);

  // 获取层次化节点 (anatomy 躯干/步法, scrotum 双球摆动, upperNodes 柱身与龟头鞭打组)
  const anatomyGroup = modelGroup.children[0] || modelGroup;
  const scrotumGroup = anatomyGroup.children[0] || null;
  const upperNodes = anatomyGroup.children.slice(2);

  // 面向方向与角位
  // solo 模式朝向镜头(+Z)，对决模式左方('a'红角)朝右(+X)稍偏镜头，右方('b'蓝角)朝左(-X)稍偏镜头
  const dirSign = side === 'a' ? 1 : side === 'b' ? -1 : 1;
  const baseX = side === 'a' ? -1.65 : side === 'b' ? 1.65 : 0;
  const baseRotY = side === 'a' ? Math.PI * 0.44 : side === 'b' ? -Math.PI * 0.44 : -0.42;

  // 初始化时定位到红蓝角站位并设定朝向
  modelGroup.position.set(baseX, 0, 0);
  modelGroup.rotation.y = baseRotY;

  const state = {
    action: 'idle',
    actionStart: performance.now(),
    actionDuration: 0,
    posture: 'idle', // 'idle' | 'ko' | 'victory'
    powerStacks: 0,
    shieldActive: false,
    phaseOffset: side === 'b' ? 2.1 : 0,
    lastActionTime: performance.now(),
  };

  // 护盾光环模型
  const shieldGeo = new THREE.TorusGeometry(1.05, 0.045, 12, 48);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: side === 'b' ? 0x4ea8ff : 0xffd452,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.rotation.x = Math.PI / 2;
  shieldMesh.position.y = minY + totalHeight * 0.48;
  modelGroup.add(shieldMesh);

  function trigger(actionName, durationMs = 780) {
    state.action = actionName;
    state.actionStart = performance.now();
    state.lastActionTime = performance.now();
    if (actionName === 'ko' || actionName === 'victory') {
      state.posture = actionName;
      state.actionDuration = 999999;
    } else {
      if (state.posture === 'ko') state.posture = 'idle';
      state.actionDuration = durationMs;
    }
  }

  function setCombatStatus({ shield = 0, strength = 0, posture = null } = {}) {
    state.shieldActive = shield > 0;
    state.powerStacks = Math.max(0, strength);
    if (posture) trigger(posture, 999999);
  }

  function update(now) {
    const t = (now / 1000) + state.phaseOffset;
    const elapsed = Math.max(0, now - state.actionStart);
    const duration = state.actionDuration || 750;
    let progress = clamp(elapsed / duration, 0, 1);

    if (state.action !== 'idle' && state.action !== 'ko' && state.action !== 'victory' && elapsed >= duration) {
      state.action = state.posture;
      progress = 0;
    }

    // 默认姿态与骨骼形变变量
    let posX = baseX;
    let posY = 0;
    let posZ = 0;
    let pitchX = 0;        // 躯干前俯/后仰 (正数向对手躬身出击，负数向后仰闪避受击)
    let yawY = 0;          // 躯干水平微转
    let tiltZ = 0;         // 左右摇摆步法 (Bob & Weave)
    let upperPitchX = 0;   // 柱身与龟头前屈鞭打
    let upperTiltZ = 0;    // 柱身横向甩动
    let upperScaleX = 1;
    let upperScaleY = 1;
    let upperScaleZ = 1;
    let scrotumPitchX = 0; // 蛋囊惯性前后摆动

    const act = state.action;

    if (act === 'idle') {
      // 鲜活的拳手抱架步法 (Boxer Bob & Weave + Rhythm)
      const stepWave = Math.sin(t * 3.6);
      const bobWave = Math.abs(Math.sin(t * 3.6));
      const swayWave = Math.cos(t * 1.8);

      if (side !== 'solo') {
        posX += stepWave * 0.16 * dirSign;
        posY += bobWave * 0.12;
        posZ += swayWave * 0.10;
        pitchX = 0.08 + stepWave * 0.06;
        tiltZ = stepWave * 0.08 * dirSign;
        upperPitchX = 0.08 + Math.sin(t * 3.6 + 0.5) * 0.12;
        scrotumPitchX = -stepWave * 0.12;
      } else {
        posY += bobWave * 0.08;
        pitchX = 0.05 + stepWave * 0.04;
        upperPitchX = Math.sin(t * 3.6 + 0.5) * 0.08;
      }
      upperScaleY = 1 + Math.sin(t * 3.6) * 0.04;
    } else if (act === 'jab') {
      // 寸劲刺击：后弓蓄势 -> 跨步穿过中线闪电抽打 -> 迅速收回
      if (progress < 0.22) {
        const k = progress / 0.22;
        posX += -0.45 * k * dirSign;
        posY += 0.06 * Math.sin(k * Math.PI);
        pitchX = -0.32 * k;
        upperPitchX = -0.38 * k;
      } else if (progress < 0.52) {
        const k = (progress - 0.22) / 0.30;
        const ease = 1 - Math.pow(1 - k, 3);
        posX += (-0.45 + 2.70 * ease) * dirSign; // 大幅前冲跨过中心线！
        posY += Math.sin(k * Math.PI) * 0.14;
        pitchX = -0.32 + 1.25 * ease;
        upperPitchX = -0.38 + 1.55 * ease;
        scrotumPitchX = -0.65 * ease;
        upperScaleY = 1 + Math.sin(k * Math.PI) * 0.24;
      } else {
        const k = (progress - 0.52) / 0.48;
        const easeOut = Math.pow(k, 1.8);
        posX += 2.25 * (1 - easeOut) * dirSign;
        pitchX = 0.93 * (1 - easeOut);
        upperPitchX = 1.17 * (1 - easeOut);
        scrotumPitchX = -0.65 * (1 - easeOut);
      }
    } else if (act === 'heavy') {
      // 泰山压顶：下蹲屈身蓄力 -> 高高跃入空中空中后仰 -> 战斧下砸重扣擂台
      if (progress < 0.34) {
        const k = progress / 0.34;
        posX += -0.40 * k * dirSign;
        posY += Math.sin(k * Math.PI * 0.5) * 2.45;
        pitchX = -0.75 * k;
        upperPitchX = -0.85 * k;
        upperScaleY = 1 + 0.30 * k;
      } else if (progress < 0.46) {
        posY = 2.45;
        posX += -0.40 * dirSign;
        pitchX = -0.75;
        upperPitchX = -0.85;
        upperScaleY = 1.30;
      } else if (progress < 0.70) {
        const k = (progress - 0.46) / 0.24;
        const easeDrop = Math.pow(k, 2.6);
        posY = 2.45 * (1 - easeDrop);
        posX += (-0.40 + 2.95 * easeDrop) * dirSign;
        pitchX = -0.75 + 2.15 * easeDrop;
        upperPitchX = -0.85 + 2.45 * easeDrop;
        upperScaleY = 1.30 - 0.45 * easeDrop;
        upperScaleX = 1 + 0.35 * easeDrop;
        upperScaleZ = 1 + 0.35 * easeDrop;
      } else {
        const k = (progress - 0.70) / 0.30;
        posY = Math.sin(k * Math.PI) * 0.38;
        posX += 2.55 * (1 - k) * dirSign;
        pitchX = 1.40 * (1 - k);
        upperPitchX = 1.60 * (1 - k);
      }
    } else if (act === 'flurry') {
      // 疾风三连抽：近身高速连续三次左右抽打
      const cycle = Math.sin(progress * Math.PI * 6);
      const env = Math.sin(progress * Math.PI);
      posX += (1.75 * env + 0.40 * Math.max(0, cycle)) * dirSign;
      posY += Math.abs(cycle) * 0.16;
      pitchX = 0.55 * env + 0.35 * Math.max(0, cycle);
      upperPitchX = 0.65 * env + 0.65 * Math.max(0, cycle);
      upperTiltZ = Math.cos(progress * Math.PI * 6) * 0.55 * dirSign;
      upperScaleY = 1 + 0.18 * Math.abs(cycle);
    } else if (act === 'guard') {
      // 海绵体硬化：下沉马步 + 躯体显著增粗 + 护盾光环
      const env = Math.sin(progress * Math.PI);
      posY += -0.32 * env;
      pitchX = -0.15 * env;
      upperScaleX = 1 + 0.42 * env;
      upperScaleZ = 1 + 0.42 * env;
      upperScaleY = 1 - 0.18 * env;
    } else if (act === 'buff') {
      // 充血超载：昂首挺拔 + 金光脉冲 + 粗长双增
      const env = Math.sin(progress * Math.PI);
      posY += 0.45 * env;
      pitchX = -0.35 * Math.sin(progress * Math.PI * 2);
      upperScaleX = 1 + 0.28 * env;
      upperScaleZ = 1 + 0.28 * env;
      upperScaleY = 1 + 0.48 * env;
    } else if (act === 'hit') {
      // 受击暴震：向绳圈方向大退 + 弹簧式震荡后仰
      const decay = Math.exp(-progress * 4.6);
      const osc = Math.cos(progress * Math.PI * 6.5);
      posX += (-1.40 * decay - 0.35 * decay * osc) * dirSign;
      posY += 0.25 * decay * Math.max(0, osc);
      pitchX = -1.15 * decay * osc;
      upperPitchX = -1.35 * decay * osc;
      scrotumPitchX = 0.75 * decay * osc;
    } else if (act === 'ko') {
      // 击倒瘫软：彻底倒在帆布垫上
      const p = clamp(elapsed / 650, 0, 1);
      posY = -0.42 * p;
      pitchX = 1.55 * p;
      upperPitchX = 0.45 * p;
      upperScaleX = 1 - 0.25 * p;
      upperScaleY = 1 - 0.28 * p;
      upperScaleZ = 1 - 0.25 * p;
    } else if (act === 'victory') {
      // 胜利加冕：跃起欢呼 + 360°旋转
      posY = Math.abs(Math.sin(t * 6)) * 0.72;
      yawY = t * 4.5;
      pitchX = Math.sin(t * 6) * 0.25;
      upperPitchX = Math.cos(t * 6) * 0.35;
      upperScaleY = 1.18;
    }

    // 强化层数额外体型增益
    if (state.powerStacks > 0) {
      const pScale = 1 + Math.min(0.28, state.powerStacks * 0.045);
      upperScaleX *= pScale;
      upperScaleZ *= pScale;
      upperScaleY *= pScale;
    }

    // 更新护盾光环
    const targetShieldOpacity = (state.shieldActive || act === 'guard') ? 0.65 : 0;
    shieldMat.opacity += (targetShieldOpacity - shieldMat.opacity) * 0.18;
    if (shieldMat.opacity > 0.01) {
      shieldMesh.rotation.z = t * 2.2;
      const s = 1 + Math.sin(t * 5) * 0.08;
      shieldMesh.scale.set(s, s, 1);
    }

    // 驱动骨骼节点属性
    modelGroup.position.set(posX, posY, posZ);
    anatomyGroup.rotation.set(pitchX, yawY, tiltZ);

    upperNodes.forEach(node => {
      node.rotation.x = upperPitchX;
      node.rotation.z = upperTiltZ;
      node.scale.set(upperScaleX, upperScaleY, upperScaleZ);
    });

    if (scrotumGroup) {
      scrotumGroup.rotation.x = scrotumPitchX;
    }
  }

  return {
    group: modelGroup,
    trigger,
    setCombatStatus,
    update,
    state,
  };
}

// ==========================================================================
// 01 · 牛子身份证 / 美容院单人 3D 展示台 (支持旋转与招式动作测试)
// ==========================================================================
export async function mountAnatomy(root, profile, options = {}) {
  if (!root) return { dispose() {}, setColors() {}, setMotion() {}, triggerAction() {} };

  let colors = { ...DEFAULT_COLORS, ...(profile?.colors || {}), ...(options.colors || {}) };
  let enabled = options.motion !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let disposed = false;
  let frame = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let model = null;
  let rig = null;
  let pedestal = null;
  let ring = null;
  let shadow = null;
  let observer = null;
  let cleanupInput = null;
  let fitCamera = () => {};

  const paintFallback = () => {
    root.innerHTML = anatomySvg(profile, colors);
    const svg = root.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
    }
  };
  paintFallback();

  const applyColors = () => {
    model?.traverse(node => {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material?.userData?.recolorable) continue;
        const slot = material.userData.slot;
        if (!slot || !colors[slot]) continue;
        material.color.set(safeColor(colors[slot], DEFAULT_COLORS[slot]));
        if (material.userData.shade) material.color.multiplyScalar(material.userData.shade);
        if (material.sheenColor) material.sheenColor.copy(material.color).lerp({ r: 1, g: .9, b: .84 }, .58);
      }
      node.userData?.updateGradient?.(colors);
    });
  };

  const control = {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      cleanupInput?.();
      disposeModel(model);
      disposeObject(pedestal);
      disposeObject(ring);
      if (shadow) {
        shadow.geometry?.dispose();
        shadow.material?.dispose();
      }
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      }
      renderer = null;
      scene = null;
      camera = null;
      model = null;
      rig = null;
    },
    setColors(next) {
      if (disposed) return;
      colors = { ...colors, ...next };
      if (renderer) applyColors();
      else paintFallback();
    },
    setMotion(next) { enabled = Boolean(next); },
    triggerAction(actionName, durationMs = 820) {
      rig?.trigger(actionName, durationMs);
    },
    resetView() {
      if (!model) return;
      model.rotation.y = 0;
      fitCamera();
    },
  };

  try {
    const THREE = await import('/vendor/three.module.js');
    if (disposed || !root.isConnected) return control;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, .1, 300);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .96;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '牛子3D模型，可拖动旋转');
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    root.innerHTML = '';
    root.append(renderer.domElement);
    control.canvas = renderer.domElement;

    model = buildAnatomyModel(THREE, profile, colors);
    model.rotation.y = -.42;
    model.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = true; });
    scene.add(model);
    rig = createAnimatedRig(THREE, model, 'solo');

    scene.add(new THREE.HemisphereLight(0xfff8ea, 0x5a4a3d, 1.45));
    const key = new THREE.DirectionalLight(0xfff1dd, 4.4);
    key.position.set(-4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3.2;
    key.shadow.camera.right = 3.2;
    key.shadow.camera.top = 4.6;
    key.shadow.camera.bottom = -3.2;
    key.shadow.camera.near = .5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -.0006;
    key.shadow.radius = 3;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce9ff, .7);
    fill.position.set(5, 3, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9c5, 2.2);
    rim.position.set(0, 2, -6);
    scene.add(rim);

    model.updateMatrixWorld(true);
    const modelBox = new THREE.Box3().setFromObject(model);
    const size = modelBox.getSize(new THREE.Vector3());
    const pedestalRadius = Math.max(1.95, Math.max(size.x, size.z) * .96);
    const baseY = modelBox.min.y;

    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x090605, transparent: true, opacity: .36, depthWrite: false });
    shadow = new THREE.Mesh(new THREE.CircleGeometry(pedestalRadius * 1.38, 64), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = baseY - .22;
    scene.add(shadow);

    pedestal = new THREE.Group();
    const matTop = new THREE.Mesh(
      new THREE.CylinderGeometry(pedestalRadius, pedestalRadius * 1.04, .22, 64),
      new THREE.MeshStandardMaterial({ color: '#eadcc3', roughness: .52, metalness: .12 })
    );
    matTop.position.y = baseY - .11;
    matTop.receiveShadow = true;
    pedestal.add(matTop);

    const apronBase = new THREE.Mesh(
      new THREE.CylinderGeometry(pedestalRadius * 1.045, pedestalRadius * 1.09, .34, 64),
      new THREE.MeshStandardMaterial({ color: '#231711', roughness: .42, metalness: .35 })
    );
    apronBase.position.y = baseY - .29;
    pedestal.add(apronBase);
    scene.add(pedestal);

    ring = new THREE.Group();
    const ringMaterial = new THREE.MeshStandardMaterial({ color: '#d4a238', roughness: .26, metalness: .8 });
    const outerBrass = new THREE.Mesh(new THREE.TorusGeometry(pedestalRadius * .96, .032, 12, 64), ringMaterial);
    outerBrass.rotation.x = Math.PI / 2;
    outerBrass.position.y = baseY + .006;
    ring.add(outerBrass);

    const innerBrass = new THREE.Mesh(new THREE.TorusGeometry(pedestalRadius * .62, .018, 10, 64), ringMaterial);
    innerBrass.rotation.x = Math.PI / 2;
    innerBrass.position.y = baseY + .006;
    ring.add(innerBrass);
    scene.add(ring);

    fitCamera = () => {
      if (!renderer || !camera) return;
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      const displayBox = new THREE.Box3().setFromObject(model);
      const fitR = Math.min(pedestalRadius * 0.78, Math.max(1.35, Math.max(size.x, size.z) * 0.68));
      displayBox.expandByPoint(new THREE.Vector3(-fitR, baseY - .22, -fitR));
      displayBox.expandByPoint(new THREE.Vector3(fitR, baseY + size.y * 0.08, fitR));
      const sphere = displayBox.getBoundingSphere(new THREE.Sphere());
      const verticalFov = camera.fov * Math.PI / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const distance = sphere.radius / Math.sin(fitFov / 2) * .96;
      const direction = new THREE.Vector3(.48, .24, .9).normalize();
      camera.position.copy(sphere.center).addScaledVector(direction, distance);
      camera.lookAt(sphere.center.x, sphere.center.y - sphere.radius * .04, sphere.center.z);
      camera.updateProjectionMatrix();
    };
    fitCamera();

    observer = new ResizeObserver(() => fitCamera());
    observer.observe(root);

    let dragging = false;
    let lastX = 0;
    const onPointerDown = event => {
      dragging = true;
      lastX = event.clientX;
      root.setPointerCapture?.(event.pointerId);
      root.classList.add('dragging');
    };
    const onPointerMove = event => {
      if (!dragging) return;
      model.rotation.y += (event.clientX - lastX) * .012;
      lastX = event.clientX;
    };
    const onPointerUp = () => {
      dragging = false;
      root.classList.remove('dragging');
    };
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    cleanupInput = () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
    };

    let lastTime = performance.now();
    const tick = now => {
      if (disposed) return;
      const delta = Math.min((now - lastTime) / 1000, .05);
      lastTime = now;
      if (enabled && !dragging) model.rotation.y += delta * .26;
      rig?.update(now);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    root.dataset.renderer = 'webgl';
  } catch {
    releaseFailedScene();
    root.innerHTML = '';
    root.dataset.renderer = 'svg';
    paintFallback();
  }

  function releaseFailedScene() {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    cleanupInput?.();
    disposeModel(model);
    disposeObject(pedestal);
    disposeObject(ring);
    if (shadow) {
      shadow.geometry?.dispose();
      shadow.material?.dispose();
    }
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    }
    renderer = scene = camera = model = rig = pedestal = ring = shadow = null;
    observer = cleanupInput = null;
  }

  return control;
}

// ==========================================================================
// 02 · 牛子游乐场中央 3D 拳击擂台：宽阔八角/方圆大台面 + 骨骼形变 + 爆裂打击特效
// ==========================================================================
export async function mountDuel(root, playerA, playerB, options = {}) {
  if (!root) return { dispose() {}, triggerAction() {}, setCombatState() {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let disposed = false;
  let frame = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let left = null;
  let right = null;
  let rigA = null;
  let rigB = null;
  let ringArenaGroup = null;
  let shockwave = null;
  let groundWave = null;
  let hitSparks = null;
  let observer = null;
  let shakeTime = 0;
  let shakeIntensity = 0;
  const baseCamPos = { x: 0, y: 1.8, z: 6.8 };
  const baseLookAt = { x: 0, y: 0.85, z: 0 };

  const paintFallback = () => {
    root.innerHTML = `<div class="duel-fallback"><div>${anatomySvg(playerA)}</div><span>VS</span><div>${anatomySvg(playerB)}</div></div>`;
  };
  paintFallback();

  const control = {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      disposeModel(left);
      disposeModel(right);
      disposeObject(ringArenaGroup);
      disposeObject(shockwave);
      disposeObject(groundWave);
      disposeObject(hitSparks);
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      }
      renderer = null;
      scene = null;
      camera = null;
    },
    // 触发某一方 ('a' 红角玩家 | 'b' 蓝角对手) 的招式动画与受击连锁
    triggerAction(side, actionName, opts = {}) {
      if (disposed || reduced) return;
      const actor = side === 'a' ? rigA : rigB;
      const target = side === 'a' ? rigB : rigA;
      if (!actor) return;

      const duration = actionName === 'flurry' ? 920 : actionName === 'heavy' ? 880 : 720;
      actor.trigger(actionName, duration);

      if (['jab', 'heavy', 'flurry'].includes(actionName)) {
        const hitDelay = actionName === 'heavy' ? 340 : 210;
        setTimeout(() => {
          if (disposed) return;
          if (!opts.blockedCompletely) {
            target?.trigger('hit', 640);
          } else {
            target?.trigger('guard', 500);
          }
          const nowTs = performance.now();
          const hitX = side === 'a' ? 0.92 : -0.92;
          const hitColor = opts.blockedCompletely ? 0x4ecbff : actionName === 'heavy' ? 0xff3b1f : 0xffd43b;
          // 激活空中冲击波光环、地面震波与爆裂火花
          if (shockwave) {
            shockwave.position.x = hitX;
            shockwave.userData.activeStart = nowTs;
            shockwave.material.color.setHex(hitColor);
          }
          if (groundWave) {
            groundWave.position.x = side === 'a' ? 1.15 : -1.15;
            groundWave.userData.activeStart = nowTs;
            groundWave.material.color.setHex(hitColor);
          }
          if (hitSparks) {
            hitSparks.position.x = hitX;
            hitSparks.userData.activeStart = nowTs;
            hitSparks.children.forEach(spark => spark.material.color.setHex(hitColor));
          }
          shakeTime = nowTs;
          shakeIntensity = actionName === 'heavy' ? 0.28 : actionName === 'flurry' ? 0.18 : 0.12;
        }, hitDelay);
      } else if (actionName === 'guard' || actionName === 'buff') {
        if (groundWave) {
          groundWave.position.x = side === 'a' ? -1.58 : 1.58;
          groundWave.userData.activeStart = performance.now();
          groundWave.material.color.setHex(actionName === 'guard' ? 0x38bdf8 : 0xfacc15);
        }
      }
    },
    setCombatState(stateA = {}, stateB = {}) {
      rigA?.setCombatStatus(stateA);
      rigB?.setCombatStatus(stateB);
    },
  };

  try {
    const THREE = await import('/vendor/three.module.js');
    if (disposed || !root.isConnected) return control;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 2, .1, 240);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'WNC 3D拳击擂台：双方牛子正面对决');
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    root.innerHTML = '';
    root.append(renderer.domElement);
    control.canvas = renderer.domElement;

    scene.add(new THREE.HemisphereLight(0xfff8ea, 0x3b2c22, 2.2));
    const key = new THREE.DirectionalLight(0xfff2de, 3.8);
    key.position.set(0, 11, 7);
    scene.add(key);
    const leftLight = new THREE.PointLight(0xff5a4d, 16, 18);
    leftLight.position.set(-4.5, 3.6, 3.6);
    scene.add(leftLight);
    const rightLight = new THREE.PointLight(0x529dff, 16, 18);
    rightLight.position.set(4.5, 3.6, 3.6);
    scene.add(rightLight);

    left = buildAnatomyModel(THREE, playerA);
    right = buildAnatomyModel(THREE, playerB);
    scene.add(left, right);

    rigA = createAnimatedRig(THREE, left, 'a');
    rigB = createAnimatedRig(THREE, right, 'b');
    // 立即更新一次矩阵，保证红蓝角初始站位 (-1.58 / +1.58) 生效后再测算擂台尺寸
    left.updateMatrixWorld(true);
    right.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(left).union(new THREE.Box3().setFromObject(right));
    const size = bounds.getSize(new THREE.Vector3());
    // 大幅扩充竞技台台面半径（横向与纵深均留出充裕的走位与闪避空间）
    const ringRadius = Math.max(4.6, size.x * 0.88, size.z * 1.45);
    const scaleX = 1.22;
    const scaleZ = 0.92;
    const baseY = bounds.min.y;

    // 构建巨型拟物 3D 锦标赛拳击擂台 (宽幅帆布台面 + 红蓝角扇区 + 厚重裙边 + 四角立柱 + 三面围绳)
    ringArenaGroup = new THREE.Group();

    const floorShadow = new THREE.Mesh(
      new THREE.CircleGeometry(ringRadius * 1.18, 64),
      new THREE.MeshBasicMaterial({ color: 0x070504, transparent: true, opacity: 0.42, depthWrite: false })
    );
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.scale.set(scaleX, scaleZ, 1);
    floorShadow.position.y = baseY - 0.52;
    ringArenaGroup.add(floorShadow);

    const matMaterial = new THREE.MeshStandardMaterial({ color: '#ece0c8', roughness: 0.54, metalness: 0.08 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(ringRadius, ringRadius * 1.03, 0.24, 64), matMaterial);
    platform.scale.set(scaleX, 1, scaleZ);
    platform.position.y = baseY - 0.12;
    ringArenaGroup.add(platform);

    // 红蓝角台面战区涂装
    const redZone = new THREE.Mesh(
      new THREE.RingGeometry(ringRadius * 0.56, ringRadius * 0.93, 32, 1, Math.PI * 0.62, Math.PI * 0.76),
      new THREE.MeshBasicMaterial({ color: 0xc42828, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    redZone.rotation.x = -Math.PI / 2;
    redZone.scale.set(scaleX, scaleZ, 1);
    redZone.position.y = baseY + 0.004;
    ringArenaGroup.add(redZone);

    const blueZone = new THREE.Mesh(
      new THREE.RingGeometry(ringRadius * 0.56, ringRadius * 0.93, 32, 1, -Math.PI * 0.38, Math.PI * 0.76),
      new THREE.MeshBasicMaterial({ color: 0x1d569e, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    blueZone.rotation.x = -Math.PI / 2;
    blueZone.scale.set(scaleX, scaleZ, 1);
    blueZone.position.y = baseY + 0.004;
    ringArenaGroup.add(blueZone);

    // 厚重皮革擂台围裙 (Apron Skirt) 与黄铜底边
    const apronMat = new THREE.MeshStandardMaterial({ color: '#211610', roughness: 0.38, metalness: 0.36 });
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(ringRadius * 1.032, ringRadius * 1.06, 0.42, 64), apronMat);
    apron.scale.set(scaleX, 1, scaleZ);
    apron.position.y = baseY - 0.33;
    ringArenaGroup.add(apron);

    const goldRingMat = new THREE.MeshStandardMaterial({ color: '#eab338', roughness: 0.26, metalness: 0.82 });
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 0.96, 0.032, 12, 72), goldRingMat);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.scale.set(scaleX, scaleZ, 1);
    outerRing.position.y = baseY + 0.008;
    ringArenaGroup.add(outerRing);

    const innerCombatRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 0.55, 0.022, 10, 64), goldRingMat);
    innerCombatRing.rotation.x = Math.PI / 2;
    innerCombatRing.scale.set(scaleX, scaleZ, 1);
    innerCombatRing.position.y = baseY + 0.007;
    ringArenaGroup.add(innerCombatRing);

    const centerLineMat = new THREE.MeshBasicMaterial({ color: '#c42828', transparent: true, opacity: 0.68 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, ringRadius * scaleZ * 1.72), centerLineMat);
    line.position.y = baseY + 0.007;
    ringArenaGroup.add(line);

    // 四个宽幅拳台角柱（带靠垫 Turnbuckles）与三面围绳（左、后、右）
    const postAngles = [Math.PI * 0.78, Math.PI * 0.22, -Math.PI * 0.78, -Math.PI * 0.22];
    const postColors = ['#c42828', '#1d569e', '#c42828', '#1d569e'];
    const postPositions = [];
    postAngles.forEach((ang, idx) => {
      const px = Math.cos(ang) * (ringRadius * scaleX * 0.93);
      const pz = -Math.sin(ang) * (ringRadius * scaleZ * 0.88);
      postPositions.push(new THREE.Vector3(px, baseY, pz));
      const postMat = new THREE.MeshStandardMaterial({ color: postColors[idx], roughness: 0.32, metalness: 0.48 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 2.25, 18), postMat);
      post.position.set(px, baseY + 1.1, pz);
      ringArenaGroup.add(post);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), goldRingMat);
      cap.position.set(px, baseY + 2.24, pz);
      ringArenaGroup.add(cap);
    });

    // 后侧与左右两侧三层围绳 (红、金白、蓝)
    const ropeColors = [0xd63030, 0xfaf3e4, 0x2667ba];
    const ropePairs = [
      [postPositions[0], postPositions[1]], // 后方主围绳
      [postPositions[2], postPositions[0]], // 左侧红角围绳
      [postPositions[1], postPositions[3]], // 右侧蓝角围绳
    ];
    [0.52, 1.12, 1.72].forEach((ropeH, rIdx) => {
      const rMat = new THREE.MeshStandardMaterial({ color: ropeColors[rIdx], roughness: 0.45 });
      ropePairs.forEach(([pStart, pEnd]) => {
        const ropeLen = pStart.distanceTo(pEnd);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, ropeLen, 8), rMat);
        rope.position.set((pStart.x + pEnd.x) / 2, baseY + ropeH, (pStart.z + pEnd.z) / 2);
        const dir = new THREE.Vector3().subVectors(pEnd, pStart).normalize();
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        ringArenaGroup.add(rope);
      });
    });

    scene.add(ringArenaGroup);

    // 1. 空中打击冲击波特效环
    shockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.42, 36),
      new THREE.MeshBasicMaterial({ color: 0xffd452, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
    );
    shockwave.position.set(0, baseY + size.y * 0.52, 0.42);
    shockwave.rotation.y = Math.PI * 0.12;
    shockwave.userData.activeStart = 0;
    scene.add(shockwave);

    // 2. 台面地面震波光环
    groundWave = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: 0xff4522, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
    );
    groundWave.rotation.x = -Math.PI / 2;
    groundWave.position.set(0, baseY + 0.015, 0);
    groundWave.userData.activeStart = 0;
    scene.add(groundWave);

    // 3. 爆裂火花射线组 (Hit Sparks)
    hitSparks = new THREE.Group();
    hitSparks.position.set(0, baseY + size.y * 0.52, 0.45);
    hitSparks.userData.activeStart = 0;
    for (let i = 0; i < 8; i += 1) {
      const ang = (i / 8) * Math.PI * 2;
      const spark = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.36, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false })
      );
      spark.userData.angle = ang;
      spark.rotation.z = ang - Math.PI / 2;
      hitSparks.add(spark);
    }
    scene.add(hitSparks);

    const fit = () => {
      if (!renderer || !camera) return;
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      // 聚焦于红蓝双雄与宽阔的内圈主战台，让大擂台铺满整个下半视窗
      const displayBox = new THREE.Box3().setFromObject(left).union(new THREE.Box3().setFromObject(right));
      const focusX = Math.max(3.25, size.x * 0.62);
      const focusZ = Math.max(2.2, size.z * 0.75);
      displayBox.expandByPoint(new THREE.Vector3(-focusX, baseY - 0.32, -focusZ));
      displayBox.expandByPoint(new THREE.Vector3(focusX, baseY + Math.max(1.85, size.y * 1.08), focusZ));
      const sphere = displayBox.getBoundingSphere(new THREE.Sphere());
      const verticalFov = camera.fov * Math.PI / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const distance = sphere.radius / Math.sin(fitFov / 2) * 0.84;
      baseCamPos.x = sphere.center.x;
      baseCamPos.y = sphere.center.y + sphere.radius * 0.28;
      baseCamPos.z = sphere.center.z + distance;
      baseLookAt.x = sphere.center.x;
      baseLookAt.y = sphere.center.y - sphere.radius * 0.06;
      baseLookAt.z = sphere.center.z;
      camera.position.set(baseCamPos.x, baseCamPos.y, baseCamPos.z);
      camera.lookAt(baseLookAt.x, baseLookAt.y, baseLookAt.z);
      camera.updateProjectionMatrix();
    };
    fit();
    control.resize = fit;
    observer = new ResizeObserver(fit);
    observer.observe(root);

    // 如果传入了初始动作（例如开场对冲），自动触发一次
    if (options.animate && !reduced) {
      rigA.trigger('jab', 750);
      rigB.trigger('jab', 750);
    }
    if (options.winnerId) {
      if (options.winnerId === playerA?.userId) {
        rigA.trigger('victory');
        rigB.trigger('ko');
      } else if (options.winnerId === playerB?.userId) {
        rigB.trigger('victory');
        rigA.trigger('ko');
      }
    }

    let lastSparringTime = performance.now();

    const tick = now => {
      if (disposed) return;
      rigA?.update(now);
      rigB?.update(now);

      // 待命状态下自动实景试探交锋 (Auto-sparring rhythm)
      if (!reduced && !options.winnerId && now - lastSparringTime > 4200) {
        lastSparringTime = now;
        if (rigA?.state.action === 'idle' && rigB?.state.action === 'idle') {
          const sparringSide = Math.random() < 0.5 ? 'a' : 'b';
          const sparringRig = sparringSide === 'a' ? rigA : rigB;
          const otherRig = sparringSide === 'a' ? rigB : rigA;
          sparringRig.trigger('jab', 680);
          setTimeout(() => {
            if (!disposed && otherRig?.state.action === 'idle') {
              otherRig.trigger('guard', 480);
            }
          }, 180);
        }
      }

      // 空中冲击波扩散动画
      if (shockwave?.userData.activeStart) {
        const swElapsed = now - shockwave.userData.activeStart;
        if (swElapsed < 400) {
          const p = swElapsed / 400;
          const sc = 0.65 + p * 3.6;
          shockwave.scale.set(sc, sc, 1);
          shockwave.material.opacity = (1 - p) * 0.9;
        } else {
          shockwave.material.opacity = 0;
          shockwave.userData.activeStart = 0;
        }
      }

      // 地面震波扩散动画
      if (groundWave?.userData.activeStart) {
        const gwElapsed = now - groundWave.userData.activeStart;
        if (gwElapsed < 480) {
          const p = gwElapsed / 480;
          const sc = 0.7 + p * 4.2;
          groundWave.scale.set(sc, sc, 1);
          groundWave.material.opacity = (1 - p) * 0.75;
        } else {
          groundWave.material.opacity = 0;
          groundWave.userData.activeStart = 0;
        }
      }

      // 爆裂火花飞溅动画
      if (hitSparks?.userData.activeStart) {
        const spElapsed = now - hitSparks.userData.activeStart;
        if (spElapsed < 340) {
          const p = spElapsed / 340;
          const dist = 0.18 + p * 0.95;
          hitSparks.children.forEach(spark => {
            const ang = spark.userData.angle;
            spark.position.set(Math.cos(ang) * dist, Math.sin(ang) * dist, 0);
            spark.scale.set(1 - p * 0.5, 1 + p * 0.8, 1);
            spark.material.opacity = (1 - p) * 0.95;
          });
        } else {
          hitSparks.children.forEach(spark => { spark.material.opacity = 0; });
          hitSparks.userData.activeStart = 0;
        }
      }

      // 镜头受击震屏
      if (shakeTime > 0 && now - shakeTime < 280) {
        const decay = 1 - (now - shakeTime) / 280;
        const sx = (Math.random() - 0.5) * shakeIntensity * decay;
        const sy = (Math.random() - 0.5) * shakeIntensity * decay;
        camera.position.set(baseCamPos.x + sx, baseCamPos.y + sy, baseCamPos.z);
      } else if (shakeTime > 0) {
        shakeTime = 0;
        camera.position.set(baseCamPos.x, baseCamPos.y, baseCamPos.z);
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    root.dataset.renderer = 'webgl';
  } catch {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    disposeModel(left);
    disposeModel(right);
    disposeObject(ringArenaGroup);
    disposeObject(shockwave);
    disposeObject(groundWave);
    disposeObject(hitSparks);
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    }
    root.innerHTML = '';
    paintFallback();
    root.dataset.renderer = 'svg';
  }
  return control;
}
