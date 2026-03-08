import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySubtitle = document.getElementById('overlaySubtitle');
const overlaySubtitleMobile = document.getElementById('overlaySubtitleMobile');
const startButton = document.getElementById('startButton');
const boostButton = document.getElementById('boostButton');

const scoreLine = document.getElementById('scoreLine');
const distanceLine = document.getElementById('distanceLine');
const bestLine = document.getElementById('bestLine');
const boostLine = document.getElementById('boostLine');

const GAME_STATE = { START: 'start', PLAYING: 'playing', GAMEOVER: 'gameover' };
const state = {
  mode: GAME_STATE.START,
  score: 0,
  distance: 0,
  bestDistance: Number(localStorage.getItem('bestDistance')) || 0,
  newRecord: false,
  elapsed: 0,
  boostActive: false,
  spawnTimer: 1,
  lowDensityTimer: 0,
  roadZOffset: 0
};

const controls = { left: false, right: false };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070f);
scene.fog = new THREE.FogExp2(0x040912, 0.022);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 4.7, 8.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const hemi = new THREE.HemisphereLight(0x66ccff, 0x080d18, 1.0);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0x78ccff, 1.4);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const ROAD_WIDTH = 8.4;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 36;
const ROAD_SEGMENTS = [];

const roadGroup = new THREE.Group();
scene.add(roadGroup);

const roadMat = new THREE.MeshStandardMaterial({
  color: 0x10192a,
  roughness: 0.45,
  metalness: 0.5,
  emissive: 0x061022,
  emissiveIntensity: 0.85
});

function createRoadSegment(z) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH), roadMat);
  base.rotation.x = -Math.PI / 2;
  group.add(base);

  const edgeGeo = new THREE.BoxGeometry(0.08, 0.05, ROAD_SEGMENT_LENGTH);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 2.2, metalness: 0.35, roughness: 0.3 });
  const edgeL = new THREE.Mesh(edgeGeo, edgeMat);
  edgeL.position.set(-ROAD_WIDTH * 0.5, 0.03, 0);
  const edgeR = edgeL.clone();
  edgeR.position.x = ROAD_WIDTH * 0.5;
  group.add(edgeL, edgeR);

  const dashMat = new THREE.MeshStandardMaterial({ color: 0x99f6ff, emissive: 0x22d3ee, emissiveIntensity: 1.65, roughness: 0.25, metalness: 0.25 });
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = -ROAD_WIDTH / 2 + lane * LANE_WIDTH;
    for (let i = 0; i < 16; i += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.1), dashMat);
      dash.position.set(x, 0.02, -ROAD_SEGMENT_LENGTH / 2 + i * 2.2 + 0.8);
      group.add(dash);
    }
  }

  group.position.z = z;
  roadGroup.add(group);
  return group;
}

for (let i = 0; i < 6; i += 1) {
  ROAD_SEGMENTS.push(createRoadSegment(-i * ROAD_SEGMENT_LENGTH));
}

const cityGroup = new THREE.Group();
scene.add(cityGroup);
for (let i = 0; i < 56; i += 1) {
  const h = Math.random() * 8 + 2;
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(Math.random() * 1.3 + 0.4, h, Math.random() * 1.3 + 0.4),
    new THREE.MeshStandardMaterial({
      color: 0x121826,
      emissive: Math.random() > 0.5 ? 0x0ea5e9 : 0xa855f7,
      emissiveIntensity: 0.2 + Math.random() * 0.45,
      roughness: 0.7,
      metalness: 0.2
    })
  );
  const side = Math.random() > 0.5 ? 1 : -1;
  b.position.set(side * (6 + Math.random() * 12), h / 2, -Math.random() * 180 - 10);
  cityGroup.add(b);
}

const player = createPlayerBike();
scene.add(player.group);

function createPlayerBike() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.35, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x2563eb, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.25 })
  );
  body.position.y = 0.45;

  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.28, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.45, metalness: 0.3, roughness: 0.3 })
  );
  front.position.set(0, 0.57, 0.72);

  const rider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.44, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x0f172a, emissiveIntensity: 0.9 })
  );
  rider.position.set(0, 0.9, 0.05);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.9, metalness: 0.2, roughness: 0.25 });
  const wheelF = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 10, 22), wheelMat);
  wheelF.rotation.y = Math.PI / 2;
  wheelF.position.set(0, 0.26, 0.62);
  const wheelR = wheelF.clone();
  wheelR.position.z = -0.62;

  const trail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.25, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.05, -1.8);

  group.add(body, front, rider, wheelF, wheelR, trail);
  group.position.set(0, 0, 4.2);

  return {
    group,
    trail,
    speed: 8.5,
    minX: -ROAD_WIDTH * 0.42,
    maxX: ROAD_WIDTH * 0.42,
    radius: 0.38
  };
}

const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);
const obstacles = [];

function createObstacle(type) {
  const group = new THREE.Group();
  let radius = 0.44;
  let sway = 0;

  if (type === 'drone') {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0xa855f7, emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.35 })
    );
    const armMat = new THREE.MeshStandardMaterial({ color: 0xddd6fe, emissive: 0xa78bfa, emissiveIntensity: 0.7 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.06), armMat);
    const arm2 = arm1.clone();
    arm2.rotation.y = Math.PI * 0.5;
    group.add(core, arm1, arm2);
    sway = 0.8;
    radius = 0.42;
  } else if (type === 'laserGate') {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH * 2 - 0.2, 0.2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xf0abfc, emissive: 0xe879f9, emissiveIntensity: 1.9, metalness: 0.35, roughness: 0.25 })
    );
    const postMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x22d3ee, emissiveIntensity: 1.1 });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), postMat);
    const p2 = p1.clone();
    p1.position.x = -beam.geometry.parameters.width * 0.5;
    p2.position.x = beam.geometry.parameters.width * 0.5;
    p1.position.y = 0.3;
    p2.position.y = 0.3;
    group.add(beam, p1, p2);
    radius = 0.8;
  } else if (type === 'energyBarrier') {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH - 0.25, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 })
    );
    group.add(barrier);
    sway = 0.35;
    radius = 0.52;
  } else if (type === 'hazardPod') {
    const pod = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.33, 0),
      new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1.5, metalness: 0.25, roughness: 0.35 })
    );
    group.add(pod);
    radius = 0.4;
  } else {
    const bot = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.48, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x0ea5e9, emissiveIntensity: 1.05, metalness: 0.3, roughness: 0.38 })
    );
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x67e8f9, emissiveIntensity: 1.8 })
    );
    eye.position.set(0, 0.1, 0.34);
    group.add(bot, eye);
    sway = 0.45;
    radius = 0.44;
  }

  group.position.y = 0.45;
  obstacleGroup.add(group);
  return { group, type, radius, sway, phase: Math.random() * Math.PI * 2 };
}

function pickType() {
  const r = Math.random();
  if (r < 0.22) return 'drone';
  if (r < 0.4) return 'laserGate';
  if (r < 0.62) return 'energyBarrier';
  if (r < 0.8) return 'hazardPod';
  return 'roadBot';
}

function currentSpeed() {
  const base = Math.min(24, 8 + state.elapsed * 0.35);
  return state.boostActive ? base * 1.35 : base;
}

function currentSpawnInterval() {
  const interval = Math.max(0.5, 1.55 - state.elapsed * 0.015);
  return state.boostActive ? interval * 0.92 : interval;
}

function spawnObstacle(force = false) {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH * 0.5 + LANE_WIDTH * laneIndex + LANE_WIDTH * 0.5;

  const tooClose = obstacles.some((o) => Math.abs(o.group.position.z - (-50)) < 8 && Math.abs(o.group.position.x - laneX) < 1.2);
  if (tooClose && !force) {
    return false;
  }

  const type = pickType();
  const obstacle = createObstacle(type);
  obstacle.group.position.set(laneX + (Math.random() - 0.5) * 0.2, 0.45, -50 - Math.random() * 14);
  obstacle.baseX = obstacle.group.position.x;
  obstacles.push(obstacle);
  return true;
}

function resetGame() {
  state.mode = GAME_STATE.PLAYING;
  state.score = 0;
  state.distance = 0;
  state.elapsed = 0;
  state.spawnTimer = 1;
  state.lowDensityTimer = 0;
  state.newRecord = false;
  state.roadZOffset = 0;
  player.group.position.x = 0;
  obstacles.forEach((o) => obstacleGroup.remove(o.group));
  obstacles.length = 0;
  hideOverlay();
}

function showStartOverlay() {
  overlay.classList.add('show');
  overlayTitle.textContent = 'NEON RUSH';
  startButton.textContent = 'START';
  overlaySubtitle.textContent = 'Press SPACE / ENTER or click START';
  overlaySubtitleMobile.textContent = 'Tap to start';
}

function showGameOverOverlay() {
  overlay.classList.add('show');
  overlayTitle.textContent = state.newRecord ? 'NEW RECORD!' : 'GAME OVER';
  startButton.textContent = 'RESTART';
  overlaySubtitle.textContent = `Distance: ${Math.floor(state.distance)} m  |  Best: ${state.bestDistance} m`;
  overlaySubtitleMobile.textContent = 'Press Enter/Space or tap to restart';
}

function hideOverlay() {
  overlay.classList.remove('show');
}

function updatePlayer(dt) {
  const move = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  player.group.position.x += move * player.speed * dt;
  player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, player.minX, player.maxX);
  player.group.rotation.z = THREE.MathUtils.lerp(player.group.rotation.z, -move * 0.18, 0.12);
  player.trail.scale.y = THREE.MathUtils.lerp(player.trail.scale.y, state.boostActive ? 1.55 : 1, 0.12);
}

function updateRoad(speed, dt) {
  state.roadZOffset += speed * dt;
  ROAD_SEGMENTS.forEach((seg) => {
    seg.position.z += speed * dt;
    if (seg.position.z > ROAD_SEGMENT_LENGTH) {
      seg.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS.length;
    }
  });
}

function updateObstacles(speed, dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = currentSpawnInterval();
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const o = obstacles[i];
    o.phase += dt * 2;
    o.group.position.z += speed * dt;
    if (o.sway > 0) {
      o.group.position.x = o.baseX + Math.sin(o.phase) * o.sway * 0.25;
    }

    if (o.group.position.z > 14) {
      obstacleGroup.remove(o.group);
      obstacles.splice(i, 1);
    }
  }

  if (obstacles.length === 0) {
    spawnObstacle(true);
  }

  const onScreen = obstacles.filter((o) => o.group.position.z > -42 && o.group.position.z < 12).length;
  if (onScreen < 2) {
    state.lowDensityTimer += dt;
    if (state.lowDensityTimer >= 1.0) {
      spawnObstacle(true);
      state.lowDensityTimer = 0;
      state.spawnTimer = Math.min(state.spawnTimer, 0.5);
    }
  } else {
    state.lowDensityTimer = 0;
  }
}

function checkCollisions() {
  const px = player.group.position.x;
  const pz = player.group.position.z;
  for (const o of obstacles) {
    const dx = o.group.position.x - px;
    const dz = o.group.position.z - pz;
    const r = o.radius + player.radius;
    if (dx * dx + dz * dz < r * r) {
      return true;
    }
  }
  return false;
}

function updateCamera(dt) {
  const target = new THREE.Vector3(player.group.position.x * 0.4, 4.8, player.group.position.z + 8.8);
  camera.position.lerp(target, 0.07 + dt * 4);
  const lookTarget = new THREE.Vector3(player.group.position.x * 0.22, 0.8, player.group.position.z - 10);
  camera.lookAt(lookTarget);
}

function updateUI() {
  scoreLine.textContent = `Score: ${state.score.toFixed(1)}s`;
  distanceLine.textContent = `Distance: ${Math.floor(state.distance)} m`;
  bestLine.textContent = `Best: ${state.bestDistance} m`;
  boostLine.textContent = `BOOST: ${state.boostActive ? 'ON' : 'OFF'}`;
  boostButton.classList.toggle('active', state.boostActive);
}

function step(dt) {
  if (state.mode !== GAME_STATE.PLAYING) return;

  state.elapsed += dt;
  state.score += dt;

  const speed = currentSpeed();
  state.distance += speed * dt * 3.15;

  updatePlayer(dt);
  updateRoad(speed, dt);
  updateObstacles(speed, dt);
  updateCamera(dt);

  if (checkCollisions()) {
    state.mode = GAME_STATE.GAMEOVER;
    const dist = Math.floor(state.distance);
    state.newRecord = dist > state.bestDistance;
    if (state.newRecord) {
      state.bestDistance = dist;
      localStorage.setItem('bestDistance', state.bestDistance);
    }
    showGameOverOverlay();
  }
}

let lastTime = performance.now();
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  step(dt);
  updateUI();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function startFromInput() {
  if (state.mode === GAME_STATE.START || state.mode === GAME_STATE.GAMEOVER) {
    resetGame();
  }
}

function toggleBoost() {
  state.boostActive = !state.boostActive;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') controls.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') controls.right = true;
  if (e.code === 'Space' || e.code === 'Enter') startFromInput();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') toggleBoost();
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') controls.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') controls.right = false;
});

canvas.addEventListener('pointerdown', (e) => {
  if (state.mode !== GAME_STATE.PLAYING) {
    startFromInput();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const onLeft = e.clientX < rect.left + rect.width * 0.5;
  controls.left = onLeft;
  controls.right = !onLeft;
});

canvas.addEventListener('pointermove', (e) => {
  if (state.mode !== GAME_STATE.PLAYING || e.pointerType === 'mouse') return;
  const rect = canvas.getBoundingClientRect();
  const onLeft = e.clientX < rect.left + rect.width * 0.5;
  controls.left = onLeft;
  controls.right = !onLeft;
});

window.addEventListener('pointerup', () => {
  controls.left = false;
  controls.right = false;
});

boostButton.addEventListener('pointerup', (e) => {
  e.stopPropagation();
  toggleBoost();
});

startButton.addEventListener('click', startFromInput);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) startFromInput();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});

showStartOverlay();
updateUI();
requestAnimationFrame(animate);
