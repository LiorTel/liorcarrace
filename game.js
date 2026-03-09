import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass.js';

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
  roadZOffset: 0,
  lastBoostToggleAt: 0
};

const controls = {
  left: false,
  right: false,
  pointerId: null
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070f);
scene.fog = new THREE.FogExp2(0x050a16, 0.024);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 4.7, 8.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.95, 0.55, 0.25);
composer.addPass(bloomPass);

const hemi = new THREE.HemisphereLight(0x6dd7ff, 0x090f1e, 0.9);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0x7de6ff, 1.5);
keyLight.position.set(5, 9, 4);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xd946ef, 0.55, 32, 2);
fillLight.position.set(-6, 2.5, -14);
scene.add(fillLight);

const ROAD_WIDTH = 8.6;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 36;

const roadGroup = new THREE.Group();
scene.add(roadGroup);
const ROAD_SEGMENTS = [];

function createRoadMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x101a2a,
    roughness: 0.43,
    metalness: 0.52,
    emissive: 0x071428,
    emissiveIntensity: 0.95
  });
}

function createRoadSegment(z) {
  const group = new THREE.Group();
  const roadMat = createRoadMaterial();

  const base = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH), roadMat);
  base.rotation.x = -Math.PI / 2;
  group.add(base);

  const stripMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x22d3ee, emissiveIntensity: 2.3, roughness: 0.2, metalness: 0.35 });
  const stripGeo = new THREE.BoxGeometry(0.08, 0.05, ROAD_SEGMENT_LENGTH);
  const leftEdge = new THREE.Mesh(stripGeo, stripMat);
  leftEdge.position.set(-ROAD_WIDTH * 0.5, 0.03, 0);
  const rightEdge = leftEdge.clone();
  rightEdge.position.x = ROAD_WIDTH * 0.5;
  group.add(leftEdge, rightEdge);

  const laneMat = new THREE.MeshStandardMaterial({ color: 0xbcfeff, emissive: 0x67e8f9, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.2 });
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = -ROAD_WIDTH / 2 + lane * LANE_WIDTH;
    for (let i = 0; i < 16; i += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.15), laneMat);
      dash.position.set(x, 0.02, -ROAD_SEGMENT_LENGTH / 2 + i * 2.2 + 0.9);
      group.add(dash);
    }
  }

  const reflectionMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.05, side: THREE.DoubleSide });
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH - 0.5, ROAD_SEGMENT_LENGTH), reflectionMat);
  reflection.position.y = 0.021;
  reflection.rotation.x = -Math.PI / 2;
  group.add(reflection);

  group.position.z = z;
  roadGroup.add(group);
  return group;
}

for (let i = 0; i < 7; i += 1) {
  ROAD_SEGMENTS.push(createRoadSegment(-i * ROAD_SEGMENT_LENGTH));
}

const skyline = new THREE.Group();
scene.add(skyline);

function createTower(x, z, h, w, colorA, colorB) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, w * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x12192b, emissive: colorA, emissiveIntensity: 0.18, roughness: 0.72, metalness: 0.2 })
  );
  body.position.set(x, h * 0.5, z);
  skyline.add(body);

  const stripMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, emissive: colorB, emissiveIntensity: 1.1, roughness: 0.28, metalness: 0.2 });
  for (let i = 0; i < 4; i += 1) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.78, 0.02), stripMat);
    strip.position.set(x - w * 0.35 + i * (w * 0.23), h * 0.53, z + w * 0.46);
    skyline.add(strip);
  }
}

for (let i = 0; i < 64; i += 1) {
  const side = i % 2 === 0 ? 1 : -1;
  const x = side * (6.2 + Math.random() * 11.5);
  const z = -Math.random() * 220 - 8;
  const h = 2.4 + Math.random() * 11;
  const w = 0.5 + Math.random() * 1.3;
  const paletteA = Math.random() > 0.5 ? 0x0ea5e9 : 0xa855f7;
  const paletteB = Math.random() > 0.5 ? 0x22d3ee : 0xe879f9;
  createTower(x, z, h, w, paletteA, paletteB);
}

const gateGroup = new THREE.Group();
scene.add(gateGroup);
for (let i = 0; i < 20; i += 1) {
  const archMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.45, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.6 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(ROAD_WIDTH * 0.6, 0.05, 8, 36, Math.PI), archMat);
  arch.rotation.z = Math.PI;
  arch.position.set(0, 1.25, -14 - i * 11);
  gateGroup.add(arch);
}

const streaks = new THREE.Group();
scene.add(streaks);
for (let i = 0; i < 80; i += 1) {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 1.6 + Math.random() * 1.8),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.18 + Math.random() * 0.22, side: THREE.DoubleSide })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set((Math.random() - 0.5) * 30, 0.06, -Math.random() * 190);
  streaks.add(line);
}

const player = createPlayerBike();
scene.add(player.group);

function createPlayerBike() {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x2563eb, emissiveIntensity: 1.05, metalness: 0.45, roughness: 0.22 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.85, metalness: 0.25, roughness: 0.25 });

  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 1.72, 8), frameMat);
  frame.rotation.x = Math.PI / 2;
  frame.position.set(0, 0.43, 0);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.58, 7), trimMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.48, 0.98);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 7), trimMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.44, -0.98);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.45), frameMat);
  seat.position.set(0, 0.78, -0.08);

  const riderBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.13, 0.44, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x0f172a, emissiveIntensity: 0.9, roughness: 0.35 })
  );
  riderBody.position.set(0, 1.03, 0.05);

  const riderHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, emissive: 0x22d3ee, emissiveIntensity: 0.45, roughness: 0.35 })
  );
  riderHead.position.set(0, 1.33, 0.17);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 2.1, roughness: 0.25, metalness: 0.2 });
  const wheelF = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.065, 12, 24), wheelMat);
  wheelF.rotation.y = Math.PI / 2;
  wheelF.position.set(0, 0.26, 0.72);

  const wheelR = wheelF.clone();
  wheelR.position.z = -0.72;

  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xcffafe, emissive: 0x67e8f9, emissiveIntensity: 1.2 });
  const spokeF = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), spokeMat);
  spokeF.position.set(0, 0.26, 0.72);
  const spokeR = spokeF.clone();
  spokeR.position.z = -0.72;

  const trail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 4.4),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.06, -2.8);

  group.add(frame, nose, tail, seat, riderBody, riderHead, wheelF, wheelR, spokeF, spokeR, trail);
  group.position.set(0, 0, 4.3);

  return {
    group,
    trail,
    speed: 8.7,
    minX: -ROAD_WIDTH * 0.42,
    maxX: ROAD_WIDTH * 0.42,
    radius: 0.4
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
      new THREE.SphereGeometry(0.26, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0xa855f7, emissiveIntensity: 1.55, metalness: 0.4, roughness: 0.32 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.04, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xe9d5ff, emissive: 0xc084fc, emissiveIntensity: 1.4 })
    );
    ring.rotation.x = Math.PI / 2;
    const armMat = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0xa78bfa, emissiveIntensity: 0.85 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), armMat);
    const arm2 = arm1.clone();
    arm2.rotation.y = Math.PI * 0.5;
    group.add(core, ring, arm1, arm2);
    sway = 0.95;
    radius = 0.44;
  } else if (type === 'laserGate') {
    const beamW = LANE_WIDTH * 2 - 0.15;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(beamW, 0.18, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xf0abfc, emissive: 0xe879f9, emissiveIntensity: 2.2, metalness: 0.35, roughness: 0.2 })
    );
    const postMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x22d3ee, emissiveIntensity: 1.3, roughness: 0.3 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), postMat);
    const postR = postL.clone();
    postL.position.set(-beamW * 0.5, 0.32, 0);
    postR.position.set(beamW * 0.5, 0.32, 0);
    group.add(beam, postL, postR);
    radius = 0.85;
  } else if (type === 'energyBarrier') {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH - 0.18, 1.0, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.6, metalness: 0.45, roughness: 0.25, transparent: true, opacity: 0.9 })
    );
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH - 0.34, 0.72, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x082f49, emissive: 0x164e63, emissiveIntensity: 0.9 })
    );
    group.add(shell, core);
    sway = 0.35;
    radius = 0.55;
  } else if (type === 'hazardPod') {
    const pod = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1.85, metalness: 0.28, roughness: 0.3 })
    );
    const spikes = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xfed7aa, emissive: 0xfb923c, emissiveIntensity: 0.5, wireframe: true })
    );
    group.add(pod, spikes);
    radius = 0.42;
  } else {
    const bot = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x0284c7, emissiveIntensity: 1.2, metalness: 0.38, roughness: 0.3 })
    );
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.12, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x67e8f9, emissiveIntensity: 2.1 })
    );
    eye.position.set(0, 0.1, 0.35);
    const sideGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.26, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xcffafe, emissive: 0x22d3ee, emissiveIntensity: 1.4 })
    );
    sideGlow.position.set(-0.33, 0, 0);
    const sideGlowR = sideGlow.clone();
    sideGlowR.position.x = 0.33;
    group.add(bot, eye, sideGlow, sideGlowR);
    sway = 0.5;
    radius = 0.46;
  }

  group.position.y = 0.46;
  obstacleGroup.add(group);
  return { group, type, radius, sway, phase: Math.random() * Math.PI * 2 };
}

function pickType() {
  const r = Math.random();
  if (r < 0.22) return 'drone';
  if (r < 0.39) return 'laserGate';
  if (r < 0.61) return 'energyBarrier';
  if (r < 0.8) return 'hazardPod';
  return 'roadBot';
}

function currentSpeed() {
  const base = Math.min(25, 8 + state.elapsed * 0.34);
  return state.boostActive ? base * 1.35 : base;
}

function currentSpawnInterval() {
  const interval = Math.max(0.5, 1.52 - state.elapsed * 0.015);
  return state.boostActive ? interval * 0.9 : interval;
}

function spawnObstacle(force = false) {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH * 0.5 + LANE_WIDTH * laneIndex + LANE_WIDTH * 0.5;

  const tooClose = obstacles.some(
    (o) => Math.abs(o.group.position.z - (-50)) < 8 && Math.abs(o.group.position.x - laneX) < 1.2
  );

  if (tooClose && !force) {
    return false;
  }

  const type = pickType();
  const obstacle = createObstacle(type);
  obstacle.group.position.set(laneX + (Math.random() - 0.5) * 0.2, 0.46, -50 - Math.random() * 14);
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

  controls.left = false;
  controls.right = false;

  player.group.position.x = 0;
  player.group.rotation.z = 0;

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
  player.group.rotation.z = THREE.MathUtils.lerp(player.group.rotation.z, -move * 0.2, 0.13);
  player.trail.scale.y = THREE.MathUtils.lerp(player.trail.scale.y, state.boostActive ? 1.9 : 1.12, 0.14);
}

function updateRoad(speed, dt) {
  state.roadZOffset += speed * dt;
  ROAD_SEGMENTS.forEach((segment) => {
    segment.position.z += speed * dt;
    if (segment.position.z > ROAD_SEGMENT_LENGTH) {
      segment.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS.length;
    }
  });

  gateGroup.children.forEach((arch) => {
    arch.position.z += speed * dt * 0.35;
    if (arch.position.z > 6) {
      arch.position.z -= 220;
    }
  });

  skyline.children.forEach((tower) => {
    tower.position.z += speed * dt * 0.2;
    if (tower.position.z > 24) {
      tower.position.z -= 240;
    }
  });

  streaks.children.forEach((line) => {
    line.position.z += speed * dt * (state.boostActive ? 2 : 1.4);
    if (line.position.z > 8) {
      line.position.z = -Math.random() * 210;
      line.position.x = (Math.random() - 0.5) * 30;
    }
    line.material.opacity = state.boostActive ? 0.4 : 0.24;
  });
}

function updateObstacles(speed, dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = currentSpawnInterval();
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    obstacle.phase += dt * 2;
    obstacle.group.position.z += speed * dt;

    if (obstacle.sway > 0) {
      obstacle.group.position.x = obstacle.baseX + Math.sin(obstacle.phase) * obstacle.sway * 0.22;
    }

    if (obstacle.group.position.z > 15) {
      obstacleGroup.remove(obstacle.group);
      obstacles.splice(i, 1);
    }
  }

  if (obstacles.length === 0) {
    spawnObstacle(true);
  }

  const onScreen = obstacles.filter((o) => o.group.position.z > -42 && o.group.position.z < 12).length;
  if (onScreen < 2) {
    state.lowDensityTimer += dt;
    if (state.lowDensityTimer >= 1) {
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

  for (const obstacle of obstacles) {
    const dx = obstacle.group.position.x - px;
    const dz = obstacle.group.position.z - pz;
    const radius = obstacle.radius + player.radius;
    if (dx * dx + dz * dz < radius * radius) {
      return true;
    }
  }

  return false;
}

function updateCamera(dt) {
  const boostY = state.boostActive ? 0.25 : 0;
  const boostZ = state.boostActive ? 0.7 : 0;
  const targetPos = new THREE.Vector3(player.group.position.x * 0.4, 4.8 + boostY, player.group.position.z + 8.8 + boostZ);
  camera.position.lerp(targetPos, 0.08 + dt * 4);

  const lookTarget = new THREE.Vector3(player.group.position.x * 0.22, 0.8, player.group.position.z - 11);
  camera.lookAt(lookTarget);

  bloomPass.strength = state.boostActive ? 1.2 : 0.95;
}

function updateUI() {
  scoreLine.textContent = `Score: ${state.score.toFixed(1)}s`;
  distanceLine.textContent = `Distance: ${Math.floor(state.distance)} m`;
  bestLine.textContent = `Best: ${state.bestDistance} m`;
  boostLine.textContent = `BOOST: ${state.boostActive ? 'ON' : 'OFF'}`;
  boostButton.classList.toggle('active', state.boostActive);
}

function step(dt) {
  if (state.mode !== GAME_STATE.PLAYING) {
    return;
  }

  state.elapsed += dt;
  state.score += dt;

  const speed = currentSpeed();
  state.distance += speed * dt * 3.2;

  updatePlayer(dt);
  updateRoad(speed, dt);
  updateObstacles(speed, dt);
  updateCamera(dt);

  if (checkCollisions()) {
    state.mode = GAME_STATE.GAMEOVER;
    const currentDistance = Math.floor(state.distance);
    state.newRecord = currentDistance > state.bestDistance;

    if (state.newRecord) {
      state.bestDistance = currentDistance;
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
  composer.render();
  requestAnimationFrame(animate);
}

function startFromInput() {
  if (state.mode === GAME_STATE.START || state.mode === GAME_STATE.GAMEOVER) {
    resetGame();
  }
}

function toggleBoost() {
  const now = performance.now();
  if (now - state.lastBoostToggleAt < 180) {
    return;
  }
  state.lastBoostToggleAt = now;
  state.boostActive = !state.boostActive;
}

function handleSteeringPointer(clientX) {
  const rect = canvas.getBoundingClientRect();
  const isLeft = clientX < rect.left + rect.width * 0.5;
  controls.left = isLeft;
  controls.right = !isLeft;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') controls.left = true;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') controls.right = true;
  if (event.code === 'Space' || event.code === 'Enter') startFromInput();
  if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) toggleBoost();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') controls.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') controls.right = false;
});

canvas.addEventListener(
  'pointerdown',
  (event) => {
    event.preventDefault();

    if (state.mode !== GAME_STATE.PLAYING) {
      startFromInput();
      return;
    }

    controls.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    handleSteeringPointer(event.clientX);
  },
  { passive: false }
);

canvas.addEventListener(
  'pointermove',
  (event) => {
    if (state.mode !== GAME_STATE.PLAYING) return;
    if (controls.pointerId !== event.pointerId) return;
    event.preventDefault();
    handleSteeringPointer(event.clientX);
  },
  { passive: false }
);

canvas.addEventListener(
  'pointerup',
  (event) => {
    event.preventDefault();
    if (controls.pointerId === event.pointerId) {
      canvas.releasePointerCapture(event.pointerId);
      controls.pointerId = null;
      controls.left = false;
      controls.right = false;
    }
  },
  { passive: false }
);

canvas.addEventListener(
  'pointercancel',
  (event) => {
    event.preventDefault();
    if (controls.pointerId === event.pointerId) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
      controls.pointerId = null;
      controls.left = false;
      controls.right = false;
    }
  },
  { passive: false }
);

boostButton.addEventListener(
  'pointerdown',
  (event) => {
    event.preventDefault();
    event.stopPropagation();
  },
  { passive: false }
);

boostButton.addEventListener(
  'pointerup',
  (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleBoost();
  },
  { passive: false }
);

startButton.addEventListener('click', startFromInput);
overlay.addEventListener('click', (event) => {
  if (event.target === overlay) {
    startFromInput();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

showStartOverlay();
updateUI();
requestAnimationFrame(animate);
