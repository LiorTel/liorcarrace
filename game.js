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

const keys = { left: false, right: false, boost: false };

const player = {
  width: 50,
  height: 92,
  x: 0,
  y: GAME_HEIGHT - 126,
  speed: 355,
  color: '#60a5fa'
};

const road = {
  dashOffset: 0,
  markerWidth: 8,
  markerHeight: 34,
  markerGap: 18,
  baseSpeedStart: 170,
  baseSpeedMax: 430,
  speedRamp: 11
};

const difficulty = {
  spawnStartInterval: 1.65,
  spawnMinInterval: 0.68,
  spawnRamp: 0.038,
  firstSpawnGrace: 1.0
};

const obstacleTypes = [
  {
    id: 'drone',
    width: 44,
    height: 30,
    laneSpan: 1,
    weight: 0.27,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 2.2;
      obstacle.x += Math.sin(obstacle.phase) * obstacle.sway * dt;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      const cx = obstacle.x + obstacle.width * 0.5;
      const cy = obstacle.y + obstacle.height * 0.5;
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 8, obstacle.width - 16, obstacle.height - 16);
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(196,181,253,0.9)';
      ctx.beginPath();
      ctx.moveTo(obstacle.x + 6, cy);
      ctx.lineTo(obstacle.x + obstacle.width - 6, cy);
      ctx.stroke();
    }
  },
  {
    id: 'energyBarrier',
    width: LANE_WIDTH * 2 - 20,
    height: 28,
    laneSpan: 2,
    weight: 0.2,
    behavior() {},
    draw(obstacle) {
      const grd = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x + obstacle.width, obstacle.y);
      grd.addColorStop(0, '#67e8f9');
      grd.addColorStop(0.5, '#22d3ee');
      grd.addColorStop(1, '#67e8f9');
      ctx.fillStyle = grd;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = 'rgba(224, 242, 254, 0.75)';
      ctx.fillRect(obstacle.x + 6, obstacle.y + 7, obstacle.width - 12, 3);
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.height - 10, obstacle.width - 12, 3);
    }
  },
  {
    id: 'roadBot',
    width: 46,
    height: 36,
    laneSpan: 1,
    weight: 0.22,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 1.8;
      obstacle.x += Math.cos(obstacle.phase) * obstacle.sway * dt * 0.9;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(obstacle.x, obstacle.y + 6, obstacle.width, obstacle.height - 12);
      ctx.fillStyle = '#082f49';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 12, obstacle.width - 16, obstacle.height - 20);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.height - 12, 10, 4);
      ctx.fillRect(obstacle.x + obstacle.width - 16, obstacle.y + obstacle.height - 12, 10, 4);
    }
  },
  {
    id: 'hazardPod',
    width: 40,
    height: 40,
    laneSpan: 1,
    weight: 0.19,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 3;
    },
    draw(obstacle) {
      const pulse = 0.65 + Math.sin(obstacle.phase * 3) * 0.2;
      const cx = obstacle.x + obstacle.width * 0.5;
      const cy = obstacle.y + obstacle.height * 0.5;
      ctx.fillStyle = `rgba(251, 146, 60, ${pulse})`;
      ctx.beginPath();
      ctx.arc(cx, cy, obstacle.width * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fdba74';
      ctx.stroke();
    }
  },
  {
    id: 'movingGate',
    width: LANE_WIDTH - 24,
    height: 56,
    laneSpan: 1,
    weight: 0.12,
    behavior(obstacle, dt) {
      obstacle.phase += dt * 2.4;
      obstacle.x += Math.sin(obstacle.phase) * obstacle.sway * dt * 0.8;
      keepObstacleInLane(obstacle);
    },
    draw(obstacle) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#fff1f2';
      for (let y = obstacle.y + 6; y < obstacle.y + obstacle.height - 4; y += 12) {
        ctx.fillRect(obstacle.x + 4, y, obstacle.width - 8, 5);
      }
    }
  }
];

const obstacles = [];
const laneTopLastY = Array(LANE_COUNT).fill(-9999);
const startButtonRect = { x: GAME_WIDTH / 2 - 130, y: GAME_HEIGHT / 2 - 18, width: 260, height: 74 };

let state = GAME_STATE.START;
let scoreSeconds = 0;
let distance = 0;
let bestDistance = Number(localStorage.getItem('bestDistance')) || 0;
let isNewRecord = false;
let elapsedDifficulty = 0;
let spawnTimer = 0;
let lastTimestamp = 0;
let boostActive = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function chooseObstacleType() {
  const total = obstacleTypes.reduce((sum, type) => sum + type.weight, 0);
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

function currentBoostMultiplier() {
  return boostActive ? 1.35 : 1;
}

function obstacleLanesFrom(type, laneStart) {
  return Array.from({ length: type.laneSpan }, (_, idx) => laneStart + idx);
}

function laneStartX(laneIndex) {
  return ROAD_X + laneIndex * LANE_WIDTH;
}

function keepObstacleInLane(obstacle) {
  const laneLeft = laneStartX(obstacle.laneStart) + 4;
  const laneRight = laneStartX(obstacle.laneStart + obstacle.type.laneSpan) - obstacle.width - 4;
  obstacle.x = clamp(obstacle.x, laneLeft, laneRight);
}

function canSpawnOnLanes(lanes) {
  const minGap = 130;
  return lanes.every((lane) => -laneTopLastY[lane] > minGap);
}

function spawnObstacles() {
  const type = chooseObstacleType();
  const maxLaneStart = LANE_COUNT - type.laneSpan;
  const laneStart = Math.floor(Math.random() * (maxLaneStart + 1));
  const lanesCovered = obstacleLanesFrom(type, laneStart);

  if (!canSpawnOnLanes(lanesCovered)) {
    return;
  }

  const laneLeft = laneStartX(laneStart) + 6;
  const laneRight = laneStartX(laneStart + type.laneSpan) - type.width - 6;
  const obstacle = {
    type,
    laneStart,
    lanesCovered,
    width: type.width,
    height: type.height,
    x: randomRange(laneLeft, laneRight),
    y: -type.height - randomRange(0, 18),
    phase: randomRange(0, Math.PI * 2),
    sway: randomRange(16, 40),
    speedOffset: randomRange(-18, 35)
  };

  obstacles.push(obstacle);
  for (const lane of lanesCovered) {
    laneTopLastY[lane] = obstacle.y;
  }
}

function resetForRun() {
  state = GAME_STATE.PLAYING;
  scoreSeconds = 0;
  distance = 0;
  isNewRecord = false;
  elapsedDifficulty = 0;
  spawnTimer = -difficulty.firstSpawnGrace;
  road.dashOffset = 0;
  obstacles.length = 0;
  laneTopLastY.fill(-9999);
  keys.left = false;
  keys.right = false;
  player.x = ROAD_X + ROAD_WIDTH * 0.5 - player.width * 0.5;
  player.y = GAME_HEIGHT - player.height - 24;
  lastTimestamp = 0;
}

function endRun() {
  state = GAME_STATE.GAMEOVER;
  const dist = Math.floor(distance);
  isNewRecord = dist > bestDistance;
  if (isNewRecord) {
    bestDistance = dist;
    localStorage.setItem('bestDistance', bestDistance);
  }
}

function setTouchSteering(clientX) {
  const rect = canvas.getBoundingClientRect();
  const mid = rect.left + rect.width * 0.5;
  keys.left = clientX < mid;
  keys.right = clientX >= mid;
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

function isInsideStartButton(clientX, clientY) {
  const p = pointerToWorld(clientX, clientY);
  return (
    p.x >= startButtonRect.x &&
    p.x <= startButtonRect.x + startButtonRect.width &&
    p.y >= startButtonRect.y &&
    p.y <= startButtonRect.y + startButtonRect.height
  );
}

function updatePlayer(dt) {
  if (keys.left) {
    player.x -= player.speed * dt;
  }
  if (keys.right) {
    player.x += player.speed * dt;
  }
  player.x = clamp(player.x, ROAD_X, ROAD_RIGHT - player.width);
}

function updateObstacles(dt, speed) {
  for (const obstacle of obstacles) {
    obstacle.type.behavior(obstacle, dt);
    obstacle.y += (speed + 58 + obstacle.speedOffset) * dt;
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    if (obstacles[i].y > GAME_HEIGHT + 80) {
      obstacles.splice(i, 1);
    }
  }

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    laneTopLastY[lane] += speed * dt;
  }

  spawnTimer += dt;
  const interval = currentSpawnInterval();
  while (spawnTimer >= interval) {
    spawnTimer -= interval;
    spawnObstacles();
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
  if (state !== GAME_STATE.PLAYING) {
    return;
  }

  elapsedDifficulty += dt;
  const speed = currentBaseSpeed() * currentBoostMultiplier();

  updatePlayer(dt);
  updateObstacles(dt, speed);

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

function drawBackgroundGlow() {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, '#050912');
  gradient.addColorStop(1, '#02050b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect((i * 71 + (road.dashOffset * 0.35)) % GAME_WIDTH, 0, 2, GAME_HEIGHT);
  }
}

function drawRoad() {
  drawBackgroundGlow();

  const roadGradient = ctx.createLinearGradient(ROAD_X, 0, ROAD_RIGHT, GAME_HEIGHT);
  roadGradient.addColorStop(0, '#111827');
  roadGradient.addColorStop(0.5, '#0f172a');
  roadGradient.addColorStop(1, '#111827');

  ctx.fillStyle = roadGradient;
  ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
  for (let y = 0; y < GAME_HEIGHT; y += 70) {
    ctx.fillRect(ROAD_X + 12, y + ((road.dashOffset * 0.2) % 70), ROAD_WIDTH - 24, 2);
  }

  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(ROAD_X + 2, 0, 3, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT - 5, 0, 3, GAME_HEIGHT);

  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#22d3ee';
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = ROAD_X + lane * LANE_WIDTH - road.markerWidth / 2;
    for (let y = -road.markerHeight; y < GAME_HEIGHT + road.markerHeight; y += road.markerHeight + road.markerGap) {
      ctx.fillRect(x, y + road.dashOffset, road.markerWidth, road.markerHeight);
    }
  }
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#052e3c';
  ctx.fillRect(0, 0, ROAD_X, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT, 0, GAME_WIDTH - ROAD_RIGHT, GAME_HEIGHT);
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;

  ctx.fillStyle = player.color;
  ctx.fillRect(x, y, player.width, player.height);

  ctx.fillStyle = '#0b1120';
  ctx.fillRect(x + 8, y + 12, player.width - 16, 26);

  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(x + 8, y + player.height - 16, 10, 5);
  ctx.fillRect(x + player.width - 18, y + player.height - 16, 10, 5);
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    obstacle.type.draw(obstacle);
  }
}

function drawHUDPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 20, 33, 0.62)';
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function drawHUD() {
  drawHUDPanel(14, 14, 210, 106);

  ctx.fillStyle = '#cffafe';
  ctx.textAlign = 'left';
  ctx.font = 'bold 23px Segoe UI';
  ctx.fillText(`Score: ${scoreSeconds.toFixed(1)}s`, 24, 44);
  ctx.font = '18px Segoe UI';
  ctx.fillText(`Distance: ${Math.floor(distance)} m`, 24, 72);
  ctx.fillText(`Best: ${bestDistance} m`, 24, 98);

  if (boostActive && state === GAME_STATE.PLAYING) {
    drawHUDPanel(GAME_WIDTH - 160, 16, 146, 42);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 17px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('BOOST ACTIVE', GAME_WIDTH - 87, 43);
  }
}

function drawStartOverlay() {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#67e8f9';
  ctx.font = 'bold 64px Segoe UI';
  ctx.fillText('Cyber Road', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 96);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(startButtonRect.x, startButtonRect.y, startButtonRect.width, startButtonRect.height, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 34px Segoe UI';
  ctx.fillText('START', GAME_WIDTH / 2, startButtonRect.y + 49);

  ctx.fillStyle = '#d1d5db';
  ctx.font = '21px Segoe UI';
  ctx.fillText('Press SPACE / ENTER or click START', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 92);
  ctx.font = '19px Segoe UI';
  ctx.fillText('Tap START or tap screen', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 126);
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 66px Segoe UI';
  ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 82);

  ctx.font = '30px Segoe UI';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`Distance: ${Math.floor(distance)} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 26);
  ctx.fillText(`Best Distance: ${bestDistance} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16);

  if (isNewRecord) {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 34px Segoe UI';
    ctx.fillText('NEW RECORD!', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 64);
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '22px Segoe UI';
  ctx.fillText('Press Enter or Space', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 108);
  ctx.font = '20px Segoe UI';
  ctx.fillText('Tap screen to restart', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 138);
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawRoad();
  drawObstacles();
  drawPlayer();
  drawHUD();

  if (state === GAME_STATE.START) {
    drawStartOverlay();
  }
  if (state === GAME_STATE.GAMEOVER) {
    drawGameOverOverlay();
  }
}

function gameLoop(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function tryStartFromKeyboard(eventCode) {
  if (eventCode === 'Enter' || eventCode === 'Space') {
    if (state === GAME_STATE.START || state === GAME_STATE.GAMEOVER) {
      resetForRun();
    }
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = true;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = true;
  }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    keys.boost = true;
    boostActive = true;
    boostButton.classList.add('active');
  }

  tryStartFromKeyboard(event.code);
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = false;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = false;
  }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    keys.boost = false;
    boostActive = false;
    boostButton.classList.remove('active');
  }
});

canvas.addEventListener('click', (event) => {
  if (state === GAME_STATE.START) {
    if (isTouchDevice() || isInsideStartButton(event.clientX, event.clientY)) {
      resetForRun();
    }
    return;
  }

  if (state === GAME_STATE.GAMEOVER) {
    resetForRun();
  }
});

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  if (state === GAME_STATE.START || state === GAME_STATE.GAMEOVER) {
    resetForRun();
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

function setBoostState(nextState) {
  boostActive = nextState;
  boostButton.classList.toggle('active', nextState);
}

boostButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  setBoostState(true);
});

window.addEventListener('pointerup', () => {
  if (!keys.boost) {
    setBoostState(false);
  }
});

boostButton.addEventListener('touchstart', (event) => {
  event.preventDefault();
  setBoostState(true);
}, { passive: false });

boostButton.addEventListener('touchend', (event) => {
  event.preventDefault();
  if (!keys.boost) {
    setBoostState(false);
  }
}, { passive: false });

player.x = ROAD_X + ROAD_WIDTH * 0.5 - player.width * 0.5;
requestAnimationFrame(gameLoop);
