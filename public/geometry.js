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
// 牛子可运动骨骼/顶点柔性形变动画引擎 (Procedural Spine + Peristaltic Rig)
// 支持：呼吸抱架(idle)、寸劲刺击(jab)、泰山压顶(heavy)、疾风连刺(flurry)、
//      海绵体硬化(guard)、充血脉动(buff)、受击弹性震颤(hit)、击倒萎缩(ko)、胜利昂首(victory)
// ==========================================================================
function createAnimatedRig(THREE, modelGroup, side = 'solo') {
  const deformableMeshes = [];
  const box = new THREE.Box3().setFromObject(modelGroup);
  const minY = box.min.y;
  const maxY = box.max.y;
  const totalHeight = Math.max(0.5, maxY - minY);
  const pivotY = minY + totalHeight * 0.18; // 阴囊上方、茎部根部作为弯曲枢轴
  const shaftSpan = Math.max(0.4, maxY - pivotY);

  modelGroup.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    const posAttr = node.geometry.attributes.position;
    const origPos = new Float32Array(posAttr.array);
    deformableMeshes.push({ mesh: node, posAttr, origPos });
  });

  // 面向方向：solo 模式朝向镜头(+Z)，对决模式左方('a')朝右(+X)，右方('b')朝左(-X)
  const dirSign = side === 'a' ? 1 : side === 'b' ? -1 : 1;
  const baseX = side === 'a' ? -1.48 : side === 'b' ? 1.48 : 0;
  const baseRotY = side === 'a' ? Math.PI * 0.42 : side === 'b' ? -Math.PI * 0.42 : -0.42;

  const state = {
    action: 'idle',
    actionStart: performance.now(),
    actionDuration: 0,
    posture: 'idle', // 'idle' | 'ko' | 'victory'
    powerStacks: 0,
    shieldActive: false,
    phaseOffset: side === 'b' ? 1.7 : 0,
  };

  // 护盾光环模型
  const shieldGeo = new THREE.TorusGeometry(0.95, 0.035, 10, 48);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: side === 'b' ? 0x4ea8ff : 0xffd452,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.rotation.x = Math.PI / 2;
  shieldMesh.position.y = minY + totalHeight * 0.45;
  modelGroup.add(shieldMesh);

  function trigger(actionName, durationMs = 780) {
    state.action = actionName;
    state.actionStart = performance.now();
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

    // 默认呼吸与拳手步伐律动 (Boxer Bob & Weave)
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;
    let bendForward = Math.sin(t * 3.2) * 0.08; // 沿自身朝向的前后弯曲角
    let bendSide = Math.cos(t * 1.6) * 0.04;
    let whipAmp = 0;
    let whipFreq = 0;
    let pulsePos = -1;
    let pulseAmp = state.powerStacks > 0 ? 0.06 * Math.min(3, state.powerStacks) : 0;
    let squashY = 1 + Math.sin(t * 3.2) * 0.025;
    let scaleMult = 1 + Math.min(0.22, state.powerStacks * 0.035);

    if (side !== 'solo') {
      // 擂台对峙时的拳击碎步与抱架摇闪
      offsetX = Math.sin(t * 3.2) * 0.07 * dirSign;
      offsetY = Math.abs(Math.sin(t * 3.2)) * 0.06;
      offsetZ = Math.cos(t * 1.6) * 0.04;
      bendForward += 0.1; // 略微前倾备战
    }

    const act = state.action;
    if (act === 'jab') {
      // 蓄力后仰 -> 突进甩鞭抽击 -> 回收
      if (progress < 0.28) {
        const p = progress / 0.28;
        offsetX = -0.28 * p * dirSign;
        bendForward = -0.42 * p;
        squashY = 1 - 0.08 * p;
      } else if (progress < 0.62) {
        const p = (progress - 0.28) / 0.34;
        const ease = 1 - Math.pow(1 - p, 3);
        offsetX = (-0.28 + 1.35 * ease) * dirSign;
        bendForward = -0.42 + 1.12 * ease;
        whipAmp = 0.22 * Math.sin(p * Math.PI);
        whipFreq = p * 10;
        squashY = 1 + 0.12 * Math.sin(p * Math.PI);
      } else {
        const p = (progress - 0.62) / 0.38;
        offsetX = 1.07 * (1 - p) * dirSign;
        bendForward = 0.7 * (1 - p) * Math.cos(p * Math.PI);
      }
    } else if (act === 'heavy') {
      // 泰山压顶：高高跃起后仰蓄力 -> 跨步重砸下劈 -> 震地回弹
      if (progress < 0.38) {
        const p = progress / 0.38;
        offsetX = -0.35 * p * dirSign;
        offsetY = Math.sin(p * Math.PI * 0.5) * 0.55;
        bendForward = -0.68 * p;
        pulsePos = p;
        pulseAmp += 0.18;
      } else if (progress < 0.68) {
        const p = (progress - 0.38) / 0.30;
        offsetX = (-0.35 + 1.55 * p) * dirSign;
        offsetY = 0.55 * (1 - p);
        bendForward = -0.68 + 1.62 * Math.pow(p, 1.4);
        squashY = 1 - 0.14 * Math.sin(p * Math.PI);
      } else {
        const p = (progress - 0.68) / 0.32;
        offsetX = 1.2 * (1 - p) * dirSign;
        bendForward = 0.94 * (1 - p);
        squashY = 1 + 0.08 * Math.sin(p * Math.PI * 2) * (1 - p);
      }
    } else if (act === 'flurry') {
      // 疾风连打：高频三次突刺 + 茎部波浪鞭打
      const cycle = Math.sin(progress * Math.PI * 6);
      const env = Math.sin(progress * Math.PI);
      offsetX = (0.55 * env + 0.38 * Math.max(0, cycle)) * dirSign;
      offsetY = Math.abs(cycle) * 0.08;
      bendForward = 0.45 * cycle * env + 0.15;
      whipAmp = 0.32 * env;
      whipFreq = progress * 24;
    } else if (act === 'guard') {
      // 海绵体硬化：下沉扎马步 + 茎部粗壮膨胀 + 护盾亮起
      const env = Math.sin(progress * Math.PI);
      offsetY = -0.08 * env;
      bendForward = -0.18 * env;
      squashY = 1 - 0.12 * env;
      pulsePos = 0.5;
      pulseAmp += 0.24 * env;
    } else if (act === 'buff') {
      // 寸止蓄力/充血超载：自根部向龟头传递明显的充血蠕动波 + 昂首挺立
      const env = Math.sin(progress * Math.PI);
      offsetY = 0.16 * env;
      bendForward = -0.25 * Math.sin(progress * Math.PI * 2);
      pulsePos = progress * 1.15;
      pulseAmp += 0.32 * env;
      squashY = 1 + 0.14 * env;
    } else if (act === 'hit') {
      // 受击硬直：向后猛烈弯折 + 阻尼弹簧震颤 (Punching Bag Recoil)
      const decay = Math.exp(-progress * 4.2);
      const osc = Math.cos(progress * Math.PI * 5.5);
      offsetX = -0.42 * decay * Math.max(0, osc) * dirSign;
      bendForward = -0.82 * decay * osc;
      bendSide = 0.25 * decay * Math.sin(progress * Math.PI * 4);
      squashY = 1 - 0.1 * decay * Math.abs(osc);
    } else if (act === 'ko') {
      // 击倒萎缩：软塌前垂、缩水趴地
      const p = clamp(elapsed / 600, 0, 1);
      offsetY = -0.22 * p;
      bendForward = 1.18 * p;
      squashY = 1 - 0.22 * p;
      scaleMult = 1 - 0.18 * p;
    } else if (act === 'victory') {
      // 胜利加冕：昂首挺胸 + 欢庆律动
      offsetY = Math.abs(Math.sin(t * 5.5)) * 0.18;
      bendForward = -0.18 + Math.sin(t * 5.5) * 0.22;
      pulsePos = (t * 1.4) % 1.2;
      pulseAmp += 0.2;
      scaleMult += 0.1;
    }

    // 更新护盾光环
    const targetShieldOpacity = (state.shieldActive || act === 'guard') ? 0.58 : 0;
    shieldMat.opacity += (targetShieldOpacity - shieldMat.opacity) * 0.18;
    if (shieldMat.opacity > 0.01) {
      shieldMesh.rotation.z = t * 1.8;
      const s = 1 + Math.sin(t * 4) * 0.05;
      shieldMesh.scale.set(s, s, 1);
    }

    // 应用根节点位移与缩放
    modelGroup.position.x = baseX + offsetX;
    modelGroup.position.y = offsetY;
    modelGroup.position.z = offsetZ;
    if (side !== 'solo') {
      modelGroup.rotation.y = baseRotY;
    }
    modelGroup.scale.setScalar(scaleMult);

    // 顶点级柔性脊椎弯曲与充血脉动形变
    const radialSquash = 1 / Math.sqrt(Math.max(0.6, squashY));
    for (const { posAttr, origPos } of deformableMeshes) {
      const arr = posAttr.array;
      for (let i = 0; i < origPos.length; i += 3) {
        const x0 = origPos[i];
        const y0 = origPos[i + 1];
        const z0 = origPos[i + 2];

        if (y0 <= pivotY) {
          // 阴囊底座：跟随惯性微幅钟摆晃动
          const ballRatio = clamp((pivotY - y0) / Math.max(0.2, pivotY - minY), 0, 1);
          const swingZ = -bendForward * 0.18 * ballRatio;
          arr[i] = x0 * radialSquash;
          arr[i + 1] = pivotY + (y0 - pivotY) * squashY;
          arr[i + 2] = z0 * radialSquash + swingZ;
        } else {
          // 茎部与龟头：非线性脊椎弯曲 + 鞭打波 + 充血蠕动波
          const h = clamp((y0 - pivotY) / shaftSpan, 0, 1.25);
          const hCurve = Math.pow(h, 1.55);
          const whip = whipAmp ? whipAmp * Math.sin(h * Math.PI * 2.2 - whipFreq) * h : 0;
          const angleZ = bendForward * hCurve + whip;
          const angleX = bendSide * hCurve;

          let pulse = 1;
          if (pulsePos >= 0 && pulseAmp > 0) {
            const dist = h - pulsePos;
            pulse += pulseAmp * Math.exp(-(dist * dist) / 0.045);
          } else if (pulseAmp > 0) {
            pulse += pulseAmp * (0.5 + 0.5 * Math.sin(t * 5 - h * 3));
          }

          const rScale = radialSquash * pulse;
          const localX = x0 * rScale;
          const localZ = z0 * rScale;
          const localY = (y0 - pivotY) * squashY;

          // 在自身局部坐标系中沿 +Z (腹侧/前向) 弯曲
          const sinZ = Math.sin(angleZ);
          const cosZ = Math.cos(angleZ);
          const curvedY = localY * cosZ - localZ * sinZ;
          const curvedZ = localZ * cosZ + localY * (sinZ * 0.58);
          const curvedX = localX + localY * Math.sin(angleX) * 0.45;

          arr[i] = curvedX;
          arr[i + 1] = pivotY + curvedY;
          arr[i + 2] = curvedZ;
        }
      }
      posAttr.needsUpdate = true;
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
    const pedestalRadius = Math.max(1.25, Math.max(size.x, size.z) * .58);
    const baseY = modelBox.min.y;

    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x090605, transparent: true, opacity: .32, depthWrite: false });
    shadow = new THREE.Mesh(new THREE.CircleGeometry(pedestalRadius * 1.48, 64), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = baseY - .18;
    scene.add(shadow);

    const pedestalMaterial = new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: .52, metalness: .12 });
    pedestal = new THREE.Mesh(new THREE.CylinderGeometry(pedestalRadius, pedestalRadius * 1.08, .16, 64), pedestalMaterial);
    pedestal.position.y = baseY - .085;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const ringMaterial = new THREE.MeshStandardMaterial({ color: '#d4a238', roughness: .28, metalness: .78 });
    ring = new THREE.Mesh(new THREE.TorusGeometry(pedestalRadius * .965, .028, 12, 64), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = baseY + .005;
    ring.receiveShadow = true;
    scene.add(ring);

    fitCamera = () => {
      if (!renderer || !camera) return;
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      const displayBox = new THREE.Box3().setFromObject(model);
      displayBox.expandByPoint(new THREE.Vector3(-pedestalRadius, baseY - .2, -pedestalRadius));
      displayBox.expandByPoint(new THREE.Vector3(pedestalRadius, baseY - .2, pedestalRadius));
      const sphere = displayBox.getBoundingSphere(new THREE.Sphere());
      const verticalFov = camera.fov * Math.PI / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const distance = sphere.radius / Math.sin(fitFov / 2) * 1.02;
      const direction = new THREE.Vector3(.52, .2, .9).normalize();
      camera.position.copy(sphere.center).addScaledVector(direction, distance);
      camera.lookAt(sphere.center.x, sphere.center.y - sphere.radius * .03, sphere.center.z);
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
// 02 · 牛子游乐场中央 3D 拳击擂台：持续循环渲染 + 卡牌出招实时骨骼形变与震屏特效
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
  let observer = null;
  let shakeTime = 0;
  let shakeIntensity = 0;
  const baseCamPos = { x: 0, y: 1.5, z: 6.5 };
  const baseLookAt = { x: 0, y: 0.9, z: 0 };

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
        const hitDelay = actionName === 'heavy' ? 360 : 230;
        setTimeout(() => {
          if (disposed) return;
          if (!opts.blockedCompletely) {
            target?.trigger('hit', 620);
          } else {
            target?.trigger('guard', 480);
          }
          // 激活冲击波光环与镜头震动
          if (shockwave) {
            shockwave.position.x = side === 'a' ? 0.85 : -0.85;
            shockwave.userData.activeStart = performance.now();
            shockwave.material.color.setHex(actionName === 'heavy' ? 0xff4522 : 0xffd452);
          }
          shakeTime = performance.now();
          shakeIntensity = actionName === 'heavy' ? 0.22 : actionName === 'flurry' ? 0.14 : 0.09;
        }, hitDelay);
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
    camera = new THREE.PerspectiveCamera(30, 2, .1, 200);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'WNC 3D拳击擂台：双方牛子正面对决');
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    root.innerHTML = '';
    root.append(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff8ea, 0x3b2c22, 2.1));
    const key = new THREE.DirectionalLight(0xfff1dd, 3.6);
    key.position.set(0, 9, 6);
    scene.add(key);
    const leftLight = new THREE.PointLight(0xff5a4d, 14, 14);
    leftLight.position.set(-3.8, 3.0, 3.2);
    scene.add(leftLight);
    const rightLight = new THREE.PointLight(0x529dff, 14, 14);
    rightLight.position.set(3.8, 3.0, 3.2);
    scene.add(rightLight);

    left = buildAnatomyModel(THREE, playerA);
    right = buildAnatomyModel(THREE, playerB);
    scene.add(left, right);

    rigA = createAnimatedRig(THREE, left, 'a');
    rigB = createAnimatedRig(THREE, right, 'b');

    const bounds = new THREE.Box3().setFromObject(left).union(new THREE.Box3().setFromObject(right));
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(2.35, Math.max(size.x, size.z) * .54);
    const baseY = bounds.min.y;

    // 构建拟物 3D 拳击擂台 (帆布擂台垫 + 裙边 + 四角立柱 + 围绳)
    ringArenaGroup = new THREE.Group();
    const matMaterial = new THREE.MeshStandardMaterial({ color: '#e6d8be', roughness: .58, metalness: .1 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, .18, 64), matMaterial);
    platform.position.y = baseY - .09;
    ringArenaGroup.add(platform);

    const apronMat = new THREE.MeshStandardMaterial({ color: '#241812', roughness: .4, metalness: .35 });
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.042, radius * 1.06, .28, 64), apronMat);
    apron.position.y = baseY - .24;
    ringArenaGroup.add(apron);

    const goldRingMat = new THREE.MeshStandardMaterial({ color: '#eab338', roughness: .28, metalness: .78 });
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * .96, .026, 10, 64), goldRingMat);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = baseY + .006;
    ringArenaGroup.add(outerRing);

    const centerLineMat = new THREE.MeshBasicMaterial({ color: '#c42828', transparent: true, opacity: .65 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(.05, .014, radius * 1.5), centerLineMat);
    line.position.y = baseY + .006;
    ringArenaGroup.add(line);

    // 四个拳台角柱与后方围绳
    const postAngles = [Math.PI * 0.78, Math.PI * 0.22, -Math.PI * 0.78, -Math.PI * 0.22];
    const postColors = ['#c42828', '#1d569e', '#c42828', '#1d569e'];
    const postPositions = [];
    postAngles.forEach((ang, idx) => {
      const px = Math.cos(ang) * (radius * 0.92);
      const pz = -Math.sin(ang) * (radius * 0.78);
      postPositions.push(new THREE.Vector3(px, baseY, pz));
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.075, 1.85, 16),
        new THREE.MeshStandardMaterial({ color: postColors[idx], roughness: 0.35, metalness: 0.45 })
      );
      post.position.set(px, baseY + 0.9, pz);
      ringArenaGroup.add(post);
    });

    // 后侧三道围绳 (红、白、蓝)
    const ropeColors = [0xd63030, 0xfaf3e4, 0x2667ba];
    [0.45, 0.95, 1.45].forEach((ropeH, rIdx) => {
      const p0 = postPositions[0];
      const p1 = postPositions[1];
      const ropeLen = p0.distanceTo(p1);
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, ropeLen, 8),
        new THREE.MeshStandardMaterial({ color: ropeColors[rIdx], roughness: 0.5 })
      );
      rope.position.set((p0.x + p1.x) / 2, baseY + ropeH, (p0.z + p1.z) / 2);
      rope.rotation.z = Math.PI / 2;
      ringArenaGroup.add(rope);
    });

    scene.add(ringArenaGroup);

    // 打击冲击波特效环
    shockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.34, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd452, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
    );
    shockwave.position.set(0, baseY + size.y * 0.52, 0.35);
    shockwave.rotation.y = Math.PI * 0.15;
    shockwave.userData.activeStart = 0;
    scene.add(shockwave);

    const fit = () => {
      if (!renderer || !camera) return;
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const displayBox = new THREE.Box3().setFromObject(left).union(new THREE.Box3().setFromObject(right));
      displayBox.expandByPoint(new THREE.Vector3(-radius, baseY - .15, -radius * .8));
      displayBox.expandByPoint(new THREE.Vector3(radius, baseY + 1.8, radius * .8));
      const sphere = displayBox.getBoundingSphere(new THREE.Sphere());
      const verticalFov = camera.fov * Math.PI / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const distance = sphere.radius / Math.sin(fitFov / 2) * .88;
      baseCamPos.x = sphere.center.x;
      baseCamPos.y = sphere.center.y + sphere.radius * 0.18;
      baseCamPos.z = sphere.center.z + distance;
      baseLookAt.x = sphere.center.x;
      baseLookAt.y = sphere.center.y - sphere.radius * 0.04;
      baseLookAt.z = sphere.center.z;
      camera.position.set(baseCamPos.x, baseCamPos.y, baseCamPos.z);
      camera.lookAt(baseLookAt.x, baseLookAt.y, baseLookAt.z);
      camera.updateProjectionMatrix();
    };
    fit();
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

    const tick = now => {
      if (disposed) return;
      rigA?.update(now);
      rigB?.update(now);

      // 冲击波扩散动画
      if (shockwave?.userData.activeStart) {
        const swElapsed = now - shockwave.userData.activeStart;
        if (swElapsed < 380) {
          const p = swElapsed / 380;
          const sc = 0.6 + p * 3.2;
          shockwave.scale.set(sc, sc, 1);
          shockwave.material.opacity = (1 - p) * 0.85;
        } else {
          shockwave.material.opacity = 0;
          shockwave.userData.activeStart = 0;
        }
      }

      // 镜头受击震屏
      if (shakeTime > 0 && now - shakeTime < 260) {
        const decay = 1 - (now - shakeTime) / 260;
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
