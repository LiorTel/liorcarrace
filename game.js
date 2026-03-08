const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const boostButton = document.getElementById('boostButton');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const ROAD_WIDTH = 420;
const ROAD_X = (GAME_WIDTH - ROAD_WIDTH) / 2;
const ROAD_RIGHT = ROAD_X + ROAD_WIDTH;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

const GAME_STATE = {
  START: 'start',
  PLAYING: 'playing',
  GAMEOVER: 'gameover'
};

const keys = { left: false, right: false };

const player = {
  width: 48,
  height: 86,
  x: 0,
  y: GAME_HEIGHT - 122,
  speed: 360
};

const road = {
  dashOffset: 0,
  markerWidth: 8,
  markerHeight: 34,
  markerGap: 18,
  baseSpeedStart: 175,
  baseSpeedMax: 450,
  speedRamp: 11
};

const difficulty = {
  spawnStartInterval: 1.65,
  spawnMinInterval: 0.65,
  spawnRamp: 0.04,
  firstSpawnGrace: 1.0,
  lowDensityTimeout: 1.1
};

const obstacleTypes = [
  {
    id: 'laserBarrier',
    laneSpan: 2,
    width: LANE_WIDTH * 2 - 18,
    height: 22,
    weight: 0.2,
    behavior() {},
    draw(obstacle) {
      const grad = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x + obstacle.width, obstacle.y);
      grad.addColorStop(0, '#f0abfc');
      grad.addColorStop(0.5, '#e879f9');
      grad.addColorStop(1, '#f0abfc');
      ctx.fillStyle = grad;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = 'rgba(254,242,255,0.8)';
      ctx.fillRect(obstacle.x + 5, obstacle.y + 8, obstacle.width - 10, 3);
    }
  },
  {
    id: 'drone',
    laneSpan: 1,
    width: 44,
    height: 30,
    weight: 0.24,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 2.1;
      obstacle.x += Math.sin(obstacle.phase) * obstacle.sway * dt;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      const cx = obstacle.x + obstacle.width * 0.5;
      const cy = obstacle.y + obstacle.height * 0.5;
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 8, obstacle.width - 16, obstacle.height - 16);
      ctx.fillStyle = '#ddd6fe';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c4b5fd';
      ctx.beginPath();
      ctx.moveTo(obstacle.x + 6, cy);
      ctx.lineTo(obstacle.x + obstacle.width - 6, cy);
      ctx.stroke();
    }
  },
  {
    id: 'energyGate',
    laneSpan: 1,
    width: LANE_WIDTH - 24,
    height: 56,
    weight: 0.16,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 2.6;
      obstacle.x += Math.sin(obstacle.phase) * obstacle.sway * dt * 0.9;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#082f49';
      ctx.fillRect(obstacle.x + 5, obstacle.y + 5, obstacle.width - 10, obstacle.height - 10);
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 10, obstacle.width - 16, 8);
      ctx.fillRect(obstacle.x + 8, obstacle.y + obstacle.height - 18, obstacle.width - 16, 8);
    }
  },
  {
    id: 'hazardPod',
    laneSpan: 1,
    width: 40,
    height: 40,
    weight: 0.22,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 3.2;
    },
    draw(obstacle) {
      const pulse = 0.62 + Math.sin(obstacle.phase * 2.4) * 0.24;
      const cx = obstacle.x + obstacle.width * 0.5;
      const cy = obstacle.y + obstacle.height * 0.5;
      ctx.fillStyle = `rgba(251,146,60,${pulse})`;
      ctx.beginPath();
      ctx.arc(cx, cy, obstacle.width * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fdba74';
      ctx.stroke();
    }
  },
  {
    id: 'roadBot',
    laneSpan: 1,
    width: 46,
    height: 34,
    weight: 0.18,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 1.8;
      obstacle.x += Math.cos(obstacle.phase) * obstacle.sway * dt * 0.8;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(obstacle.x, obstacle.y + 6, obstacle.width, obstacle.height - 12);
      ctx.fillStyle = '#082f49';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 10, obstacle.width - 16, obstacle.height - 18);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.height - 11, 10, 4);
      ctx.fillRect(obstacle.x + obstacle.width - 16, obstacle.y + obstacle.height - 11, 10, 4);
    }
  }
];

const obstacles = [];
const laneSpawnCooldowns = Array(LANE_COUNT).fill(0);
const particles = [];
const startButtonRect = { x: GAME_WIDTH / 2 - 130, y: GAME_HEIGHT / 2 - 16, width: 260, height: 72 };

let state = GAME_STATE.START;
let scoreSeconds = 0;
let distance = 0;
let bestDistance = Number(localStorage.getItem('bestDistance')) || 0;
let newRecord = false;
let elapsedDifficulty = 0;
let spawnTimer = difficulty.firstSpawnGrace;
let lowDensityTimer = 0;
let lastTimestamp = 0;
let boostActive = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function chooseObstacleType() {
  const total = obstacleTypes.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  for (const type of obstacleTypes) {
    roll -= type.weight;
    if (roll <= 0) {
      return type;
    }
  }
  return obstacleTypes[0];
}

function currentBaseSpeed() {
  return clamp(road.baseSpeedStart + elapsedDifficulty * road.speedRamp, road.baseSpeedStart, road.baseSpeedMax);
}

function currentSpawnInterval() {
  return clamp(
    difficulty.spawnStartInterval - elapsedDifficulty * difficulty.spawnRamp,
    difficulty.spawnMinInterval,
    difficulty.spawnStartInterval
  );
}

function laneStartX(lane) {
  return ROAD_X + lane * LANE_WIDTH;
}

function keepObstacleInLane(obstacle) {
  const left = laneStartX(obstacle.laneStart) + 4;
  const right = laneStartX(obstacle.laneStart + obstacle.type.laneSpan) - obstacle.width - 4;
  obstacle.x = clamp(obstacle.x, left, right);
}

function spawnCooldownDuration() {
  return Math.max(0.32, currentSpawnInterval() * 0.55);
}

function canSpawnLanes(lanes, ignoreCooldown = false) {
  if (ignoreCooldown) {
    return true;
  }
  return lanes.every((lane) => laneSpawnCooldowns[lane] <= 0);
}

function createObstacle(type, laneStart) {
  const left = laneStartX(laneStart) + 6;
  const right = laneStartX(laneStart + type.laneSpan) - type.width - 6;
  return {
    type,
    laneStart,
    lanesCovered: Array.from({ length: type.laneSpan }, (_, i) => laneStart + i),
    width: type.width,
    height: type.height,
    x: randomRange(left, right),
    y: -type.height - randomRange(0, 16),
    phase: randomRange(0, Math.PI * 2),
    sway: randomRange(16, 36),
    speedOffset: randomRange(-16, 32)
  };
}

function spawnObstacle({ force = false } = {}) {
  const attempts = 10;
  for (let i = 0; i < attempts; i += 1) {
    const type = chooseObstacleType();
    const maxLaneStart = LANE_COUNT - type.laneSpan;
    const laneStart = Math.floor(Math.random() * (maxLaneStart + 1));
    const lanesCovered = Array.from({ length: type.laneSpan }, (_, idx) => laneStart + idx);

    if (!canSpawnLanes(lanesCovered, force)) {
      continue;
    }

    const obstacle = createObstacle(type, laneStart);
    obstacles.push(obstacle);

    const cooldown = spawnCooldownDuration();
    for (const lane of lanesCovered) {
      laneSpawnCooldowns[lane] = force ? Math.min(laneSpawnCooldowns[lane], cooldown * 0.65) : cooldown;
    }

    return true;
  }

  return false;
}

function resetRun() {
  state = GAME_STATE.PLAYING;
  scoreSeconds = 0;
  distance = 0;
  newRecord = false;
  elapsedDifficulty = 0;
  spawnTimer = difficulty.firstSpawnGrace;
  lowDensityTimer = 0;
  road.dashOffset = 0;
  obstacles.length = 0;
  particles.length = 0;
  laneSpawnCooldowns.fill(0);
  keys.left = false;
  keys.right = false;
  player.x = ROAD_X + ROAD_WIDTH * 0.5 - player.width * 0.5;
  player.y = GAME_HEIGHT - player.height - 24;
  lastTimestamp = 0;
}

function endRun() {
  state = GAME_STATE.GAMEOVER;
  const current = Math.floor(distance);
  newRecord = current > bestDistance;
  if (newRecord) {
    bestDistance = current;
    localStorage.setItem('bestDistance', bestDistance);
  }
}

function toggleBoost() {
  boostActive = !boostActive;
  boostButton.classList.toggle('active', boostActive);
}

function setTouchSteering(clientX) {
  const rect = canvas.getBoundingClientRect();
  const midpoint = rect.left + rect.width * 0.5;
  keys.left = clientX < midpoint;
  keys.right = clientX >= midpoint;
}

function clearTouchSteering() {
  keys.left = false;
  keys.right = false;
}

function pointerToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * GAME_WIDTH,
    y: ((clientY - rect.top) / rect.height) * GAME_HEIGHT
  };
}

function inStartButton(clientX, clientY) {
  const p = pointerToWorld(clientX, clientY);
  return (
    p.x >= startButtonRect.x &&
    p.x <= startButtonRect.x + startButtonRect.width &&
    p.y >= startButtonRect.y &&
    p.y <= startButtonRect.y + startButtonRect.height
  );
}

function updatePlayer(dt) {
  if (keys.left) player.x -= player.speed * dt;
  if (keys.right) player.x += player.speed * dt;
  player.x = clamp(player.x, ROAD_X, ROAD_RIGHT - player.width);
}

function emitSpeedParticles(speed, dt) {
  const amount = Math.floor((speed / 120) * dt * 7);
  for (let i = 0; i < amount; i += 1) {
    particles.push({
      x: randomRange(ROAD_X + 10, ROAD_RIGHT - 10),
      y: randomRange(0, GAME_HEIGHT),
      len: randomRange(8, 22),
      alpha: randomRange(0.18, 0.55),
      speed: randomRange(70, 180)
    });
  }
}

function updateParticles(dt, speed) {
  emitSpeedParticles(speed, dt);
  for (const p of particles) {
    p.y += (p.speed + speed * 0.6) * dt;
    p.alpha *= 0.987;
  }
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].y > GAME_HEIGHT + 30 || particles[i].alpha < 0.08) {
      particles.splice(i, 1);
    }
  }
}

function updateObstacles(dt, speed) {
  for (const obstacle of obstacles) {
    obstacle.type.behavior(obstacle, dt);
    obstacle.y += (speed + 55 + obstacle.speedOffset) * dt;
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    if (obstacles[i].y > GAME_HEIGHT + obstacles[i].height + 20) {
      obstacles.splice(i, 1);
    }
  }

  for (let lane = 0; lane < laneSpawnCooldowns.length; lane += 1) {
    laneSpawnCooldowns[lane] = Math.max(0, laneSpawnCooldowns[lane] - dt);
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const didSpawn = spawnObstacle();
    const spawnInterval = currentSpawnInterval();
    spawnTimer = didSpawn ? spawnInterval : Math.min(0.22, spawnInterval * 0.35);
  }

  const visibleCount = obstacles.filter(
    (obstacle) => obstacle.y + obstacle.height > -12 && obstacle.y < GAME_HEIGHT + 12
  ).length;

  if (obstacles.length === 0) {
    spawnObstacle({ force: true });
    spawnTimer = Math.max(0.2, currentSpawnInterval() * 0.5);
    lowDensityTimer = 0;
    return;
  }

  if (visibleCount < 2) {
    lowDensityTimer += dt;
    if (lowDensityTimer >= difficulty.lowDensityTimeout) {
      if (spawnObstacle({ force: true })) {
        spawnTimer = Math.max(0.2, currentSpawnInterval() * 0.5);
      }
      lowDensityTimer = 0;
    }
  } else {
    lowDensityTimer = 0;
  }
}

function checkCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function update(dt) {
  if (state !== GAME_STATE.PLAYING) return;

  elapsedDifficulty += dt;
  const speed = currentBaseSpeed() * (boostActive ? 1.34 : 1);

  updatePlayer(dt);
  updateObstacles(dt, speed);
  updateParticles(dt, speed);

  road.dashOffset = (road.dashOffset + speed * dt) % (road.markerHeight + road.markerGap);
  scoreSeconds += dt;
  distance += speed * dt;

  for (const obstacle of obstacles) {
    if (checkCollision(player, obstacle)) {
      endRun();
      break;
    }
  }
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  bg.addColorStop(0, '#020617');
  bg.addColorStop(1, '#01030a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(34,211,238,0.05)';
  for (let i = 0; i < 14; i += 1) {
    ctx.fillRect((i * 63 + road.dashOffset * 0.26) % GAME_WIDTH, 0, 2, GAME_HEIGHT);
  }
}

function drawRoad() {
  drawBackground();

  const roadGrad = ctx.createLinearGradient(ROAD_X, 0, ROAD_RIGHT, GAME_HEIGHT);
  roadGrad.addColorStop(0, '#0f172a');
  roadGrad.addColorStop(0.5, '#111827');
  roadGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(148,163,184,0.15)';
  for (let y = 0; y < GAME_HEIGHT; y += 62) {
    ctx.fillRect(ROAD_X + 14, y + ((road.dashOffset * 0.25) % 62), ROAD_WIDTH - 28, 2);
  }

  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(ROAD_X + 2, 0, 3, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT - 5, 0, 3, GAME_HEIGHT);

  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = ROAD_X + lane * LANE_WIDTH - road.markerWidth / 2;
    for (let y = -road.markerHeight; y < GAME_HEIGHT + road.markerHeight; y += road.markerHeight + road.markerGap) {
      ctx.fillRect(x, y + road.dashOffset, road.markerWidth, road.markerHeight);
    }
  }
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#05263c';
  ctx.fillRect(0, 0, ROAD_X, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT, 0, GAME_WIDTH - ROAD_RIGHT, GAME_HEIGHT);
}

function drawParticles() {
  for (const p of particles) {
    ctx.strokeStyle = `rgba(103,232,249,${p.alpha})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + p.len);
    ctx.stroke();
  }
}

function drawPlayerBike() {
  const x = player.x;
  const y = player.y;

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 72);
  ctx.lineTo(x + 24, y + 12);
  ctx.lineTo(x + 40, y + 22);
  ctx.lineTo(x + 34, y + 72);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x + 22, y + 10, 12, 10);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 16, y + 36, 16, 16);

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 76);
  ctx.lineTo(x + 40, y + 76);
  ctx.stroke();

  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(34,211,238,0.7)';
  ctx.fillRect(x + 4, y + 80, 40, 3);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 10, y + 80, 8, 0, Math.PI * 2);
  ctx.arc(x + 38, y + 80, 8, 0, Math.PI * 2);
  ctx.stroke();
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    obstacle.type.draw(obstacle);
  }
}

function drawPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(5, 20, 36, 0.65)';
  ctx.strokeStyle = 'rgba(103,232,249,0.52)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
}

function drawHUD() {
  drawPanel(14, 14, 220, 110);
  ctx.fillStyle = '#cffafe';
  ctx.textAlign = 'left';
  ctx.font = '700 22px Orbitron';
  ctx.fillText(`SCORE ${scoreSeconds.toFixed(1)}s`, 24, 42);
  ctx.font = '500 16px Orbitron';
  ctx.fillText(`DIST ${Math.floor(distance)} m`, 24, 70);
  ctx.fillText(`BEST ${bestDistance} m`, 24, 96);

  if (boostActive && state === GAME_STATE.PLAYING) {
    drawPanel(GAME_WIDTH - 174, 14, 160, 42);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 15px Orbitron';
    ctx.fillText('BOOST ONLINE', GAME_WIDTH - 94, 40);
  }
}

function drawStartOverlay() {
  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#67e8f9';
  ctx.font = '900 62px Orbitron';
  ctx.fillText('Cyber Road', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 98);

  drawPanel(startButtonRect.x, startButtonRect.y, startButtonRect.width, startButtonRect.height);
  ctx.fillStyle = '#e0f2fe';
  ctx.font = '700 30px Orbitron';
  ctx.fillText('START', GAME_WIDTH / 2, startButtonRect.y + 47);

  ctx.fillStyle = '#d1d5db';
  ctx.font = '500 18px Orbitron';
  ctx.fillText('Press SPACE / ENTER or click START', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90);
  ctx.fillText('Tap START or tap screen', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 122);
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(2,6,23,0.74)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 58px Orbitron';
  ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 86);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 26px Orbitron';
  ctx.fillText(`DISTANCE ${Math.floor(distance)} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 28);
  ctx.fillText(`BEST ${bestDistance} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12);

  if (newRecord) {
    ctx.fillStyle = '#facc15';
    ctx.font = '900 30px Orbitron';
    ctx.fillText('NEW RECORD!', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 58);
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 18px Orbitron';
  ctx.fillText('Press Enter or Space', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 102);
  ctx.fillText('Tap screen to restart', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 132);
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawRoad();
  drawParticles();
  drawObstacles();
  drawPlayerBike();
  drawHUD();

  if (state === GAME_STATE.START) drawStartOverlay();
  if (state === GAME_STATE.GAMEOVER) drawGameOverOverlay();
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function tryStartFromKeyboard(code) {
  if ((code === 'Enter' || code === 'Space') && (state === GAME_STATE.START || state === GAME_STATE.GAMEOVER)) {
    resetRun();
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = true;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = true;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    if (!boostActive) {
      toggleBoost();
    }
  }
  tryStartFromKeyboard(event.code);
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
});

canvas.addEventListener('click', (event) => {
  if (state === GAME_STATE.START) {
    if (isTouchDevice() || inStartButton(event.clientX, event.clientY)) {
      resetRun();
    }
    return;
  }
  if (state === GAME_STATE.GAMEOVER) {
    resetRun();
  }
});

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) return;

  if (state === GAME_STATE.START || state === GAME_STATE.GAMEOVER) {
    resetRun();
  }
  if (state === GAME_STATE.PLAYING) {
    setTouchSteering(touch.clientX);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (touch && state === GAME_STATE.PLAYING) {
    setTouchSteering(touch.clientX);
  }
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  event.preventDefault();
  if (event.touches.length === 0) {
    clearTouchSteering();
  }
}, { passive: false });

canvas.addEventListener('touchcancel', clearTouchSteering);

boostButton.addEventListener('pointerup', (event) => {
  event.preventDefault();
  toggleBoost();
});

player.x = ROAD_X + ROAD_WIDTH * 0.5 - player.width * 0.5;
requestAnimationFrame(gameLoop);
