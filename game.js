const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

const road = {
  dashOffset: 0,
  markerWidth: 10,
  markerHeight: 42,
  markerGap: 26,
  startSpeed: 190,
  maxSpeed: 430,
  rampPerSecond: 10
};

const difficulty = {
  spawnStartInterval: 1.8,
  spawnMinInterval: 0.75,
  spawnRampPerSecond: 0.035,
  firstSpawnGrace: 1.0
};

const keys = {
  left: false,
  right: false
};

const player = {
  width: 48,
  height: 88,
  x: 0,
  y: GAME_HEIGHT - 130,
  speed: 340,
  color: '#3b82f6'
};

const obstacleTypes = [
  {
    id: 'cone',
    label: 'Traffic Cone',
    width: 32,
    height: 48,
    laneSpan: 1,
    weight: 0.35,
    draw(obstacle) {
      const x = obstacle.x;
      const y = obstacle.y;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(x + obstacle.width * 0.5, y);
      ctx.lineTo(x, y + obstacle.height);
      ctx.lineTo(x + obstacle.width, y + obstacle.height);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff7ed';
      ctx.fillRect(x + 5, y + obstacle.height * 0.45, obstacle.width - 10, 6);
    }
  },
  {
    id: 'block',
    label: 'Road Block',
    width: 52,
    height: 58,
    laneSpan: 1,
    weight: 0.3,
    draw(obstacle) {
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(obstacle.x + 6, obstacle.y + 8, obstacle.width - 12, 8);
    }
  },
  {
    id: 'barrier',
    label: 'Barrier',
    width: LANE_WIDTH * 2 - 18,
    height: 42,
    laneSpan: 2,
    weight: 0.2,
    draw(obstacle) {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

      const stripeCount = 5;
      const stripeWidth = obstacle.width / stripeCount;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < stripeCount; i += 2) {
        ctx.fillRect(obstacle.x + i * stripeWidth, obstacle.y + 6, stripeWidth * 0.6, obstacle.height - 12);
      }
    }
  },
  {
    id: 'crate',
    label: 'Crate',
    width: 54,
    height: 54,
    laneSpan: 1,
    weight: 0.15,
    draw(obstacle) {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.strokeRect(obstacle.x + 3, obstacle.y + 3, obstacle.width - 6, obstacle.height - 6);
      ctx.beginPath();
      ctx.moveTo(obstacle.x + 6, obstacle.y + 6);
      ctx.lineTo(obstacle.x + obstacle.width - 6, obstacle.y + obstacle.height - 6);
      ctx.moveTo(obstacle.x + obstacle.width - 6, obstacle.y + 6);
      ctx.lineTo(obstacle.x + 6, obstacle.y + obstacle.height - 6);
      ctx.stroke();
    }
  }
];

const obstacles = [];
const startButton = {
  x: GAME_WIDTH / 2 - 120,
  y: GAME_HEIGHT / 2 - 40,
  width: 240,
  height: 80
};

let gameState = GAME_STATE.START;
let gameOver = false;
let scoreSeconds = 0;
let distance = 0;
let bestDistance = Number(localStorage.getItem('bestDistance')) || 0;
let wasNewBest = false;
let difficultyTime = 0;
let spawnTimer = 0;
let lastTimestamp = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function weightedTypePick() {
  const totalWeight = obstacleTypes.reduce((sum, type) => sum + type.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const type of obstacleTypes) {
    roll -= type.weight;
    if (roll <= 0) {
      return type;
    }
  }

  return obstacleTypes[0];
}

function currentRoadSpeed() {
  return clamp(road.startSpeed + difficultyTime * road.rampPerSecond, road.startSpeed, road.maxSpeed);
}

function currentSpawnInterval() {
  return clamp(
    difficulty.spawnStartInterval - difficultyTime * difficulty.spawnRampPerSecond,
    difficulty.spawnMinInterval,
    difficulty.spawnStartInterval
  );
}

function laneStartX(laneIndex) {
  return ROAD_X + laneIndex * LANE_WIDTH;
}

function spawnObstacle() {
  const type = weightedTypePick();
  const maxLaneStart = LANE_COUNT - type.laneSpan;
  const laneIndex = Math.floor(Math.random() * (maxLaneStart + 1));

  const slotWidth = type.laneSpan * LANE_WIDTH;
  const minX = laneStartX(laneIndex) + 6;
  const maxX = laneStartX(laneIndex) + slotWidth - type.width - 6;
  const x = randomRange(minX, maxX);

  const obstacle = {
    id: `${type.id}-${performance.now()}-${Math.random()}`,
    type,
    x,
    y: -type.height - randomRange(0, 20),
    width: type.width,
    height: type.height,
    speedOffset: randomRange(-10, 30)
  };

  const tooCloseToTop = obstacles.some((item) => item.y < 95);
  if (!tooCloseToTop) {
    obstacles.push(obstacle);
  }
}

function setTouchInput(clientX) {
  const rect = canvas.getBoundingClientRect();
  const relativeX = clientX - rect.left;
  const midpoint = rect.width * 0.5;
  keys.left = relativeX < midpoint;
  keys.right = relativeX >= midpoint;
}

function clearTouchInput() {
  keys.left = false;
  keys.right = false;
}

function isInsideStartButton(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * GAME_WIDTH;
  const y = ((clientY - rect.top) / rect.height) * GAME_HEIGHT;

  return (
    x >= startButton.x &&
    x <= startButton.x + startButton.width &&
    y >= startButton.y &&
    y <= startButton.y + startButton.height
  );
}

function startGame() {
  gameState = GAME_STATE.PLAYING;
  gameOver = false;
  wasNewBest = false;
  scoreSeconds = 0;
  distance = 0;
  difficultyTime = 0;
  spawnTimer = -difficulty.firstSpawnGrace;
  obstacles.length = 0;
  clearTouchInput();

  player.x = ROAD_X + ROAD_WIDTH * 0.35;
  player.y = GAME_HEIGHT - player.height - 24;
  road.dashOffset = 0;
  lastTimestamp = 0;
}

function endGame() {
  gameState = GAME_STATE.GAMEOVER;
  gameOver = true;

  const currentDistance = Math.floor(distance);
  wasNewBest = currentDistance > bestDistance;
  if (wasNewBest) {
    bestDistance = currentDistance;
    localStorage.setItem('bestDistance', bestDistance);
  }
}

function handleInput(dt) {
  if (keys.left) {
    player.x -= player.speed * dt;
  }
  if (keys.right) {
    player.x += player.speed * dt;
  }

  const minX = ROAD_X;
  const maxX = ROAD_RIGHT - player.width;
  player.x = clamp(player.x, minX, maxX);
}

function updateObstacles(dt, roadSpeed) {
  const obstacleSpeedBase = roadSpeed + 50;

  for (const obstacle of obstacles) {
    obstacle.y += (obstacleSpeedBase + obstacle.speedOffset) * dt;
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    if (obstacles[i].y > GAME_HEIGHT + obstacles[i].height + 20) {
      obstacles.splice(i, 1);
    }
  }

  spawnTimer += dt;
  const spawnInterval = currentSpawnInterval();
  while (spawnTimer >= spawnInterval) {
    spawnTimer -= spawnInterval;
    spawnObstacle();
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
  if (gameState !== GAME_STATE.PLAYING) {
    return;
  }

  difficultyTime += dt;
  const roadSpeed = currentRoadSpeed();

  handleInput(dt);
  updateObstacles(dt, roadSpeed);

  road.dashOffset = (road.dashOffset + roadSpeed * dt) % (road.markerHeight + road.markerGap);

  scoreSeconds += dt;
  distance += roadSpeed * dt;

  for (const obstacle of obstacles) {
    if (checkCollision(player, obstacle)) {
      endGame();
      return;
    }
  }
}

function drawRoad() {
  ctx.fillStyle = '#205a2f';
  ctx.fillRect(0, 0, ROAD_X, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT, 0, GAME_WIDTH - ROAD_RIGHT, GAME_HEIGHT);

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ROAD_X + 2, 0, 4, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT - 6, 0, 4, GAME_HEIGHT);

  ctx.fillStyle = '#f9fafb';
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const laneX = ROAD_X + LANE_WIDTH * lane - road.markerWidth / 2;
    for (let y = -road.markerHeight; y < GAME_HEIGHT + road.markerHeight; y += road.markerHeight + road.markerGap) {
      ctx.fillRect(laneX, y + road.dashOffset, road.markerWidth, road.markerHeight);
    }
  }
}

function drawPlayerCar() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(player.x + 8, player.y + 10, player.width - 16, 20);
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    obstacle.type.draw(obstacle);
  }
}

function drawHUD() {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${scoreSeconds.toFixed(1)}s`, 18, 36);

  ctx.font = '18px Arial';
  ctx.fillText(`Distance: ${Math.floor(distance)} m`, 18, 62);
  ctx.fillText(`Best: ${bestDistance} m`, 18, 86);
}

function drawCenteredPanel(title, lines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px Arial';
  ctx.fillText(title, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110);

  ctx.fillStyle = '#111827';
  ctx.fillRect(startButton.x, startButton.y, startButton.width, startButton.height);
  ctx.strokeStyle = '#f9fafb';
  ctx.lineWidth = 2;
  ctx.strokeRect(startButton.x, startButton.y, startButton.width, startButton.height);

  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 34px Arial';
  ctx.fillText('Start Game', GAME_WIDTH / 2, startButton.y + 52);

  ctx.font = '20px Arial';
  let lineY = startButton.y + startButton.height + 40;
  for (const line of lines) {
    ctx.fillText(line, GAME_WIDTH / 2, lineY);
    lineY += 30;
  }
}

function drawStartScreen() {
  const mobile = isTouchDevice();
  drawCenteredPanel('Road Runner', [
    'Press Space / Enter or click to start',
    mobile ? 'Tap to start' : 'Use arrows or A/D to steer'
  ]);
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 62px Arial';
  ctx.fillText('Game Over', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 95);

  ctx.font = '28px Arial';
  ctx.fillText(`Distance: ${Math.floor(distance)} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
  ctx.fillText(`Best Distance: ${bestDistance} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 3);

  if (wasNewBest) {
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('New Best!', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 36);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '22px Arial';
  const restartText = isTouchDevice() ? 'Tap to restart' : 'Press Enter or Space to restart';
  ctx.fillText(restartText, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 78);
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawRoad();
  drawObstacles();
  drawPlayerCar();
  drawHUD();

  if (gameState === GAME_STATE.START) {
    drawStartScreen();
  } else if (gameState === GAME_STATE.GAMEOVER) {
    drawGameOverScreen();
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

function onStartOrRestartInput() {
  if (gameState === GAME_STATE.START || gameState === GAME_STATE.GAMEOVER) {
    startGame();
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = true;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = true;
  }

  if (event.code === 'Enter' || event.code === 'Space') {
    onStartOrRestartInput();
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = false;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = false;
  }
});

canvas.addEventListener('click', (event) => {
  if (gameState === GAME_STATE.START) {
    if (isTouchDevice() || isInsideStartButton(event.clientX, event.clientY)) {
      startGame();
    }
    return;
  }

  if (gameState === GAME_STATE.GAMEOVER) {
    startGame();
  }
});

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  if (gameState === GAME_STATE.START) {
    startGame();
    setTouchInput(touch.clientX);
    return;
  }

  if (gameState === GAME_STATE.GAMEOVER) {
    startGame();
    setTouchInput(touch.clientX);
    return;
  }

  setTouchInput(touch.clientX);
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (touch && gameState === GAME_STATE.PLAYING) {
    setTouchInput(touch.clientX);
  }
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  event.preventDefault();
  if (event.touches.length === 0) {
    clearTouchInput();
  }
}, { passive: false });

canvas.addEventListener('touchcancel', clearTouchInput);

player.x = ROAD_X + ROAD_WIDTH * 0.35;
player.y = GAME_HEIGHT - player.height - 24;
requestAnimationFrame(gameLoop);
