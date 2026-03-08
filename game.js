const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

const ROAD_WIDTH = 420;
const ROAD_X = (GAME_WIDTH - ROAD_WIDTH) / 2;
const ROAD_RIGHT = ROAD_X + ROAD_WIDTH;
const LANE_COUNT = 3;

const road = {
  dashOffset: 0,
  scrollSpeed: 300,
  markerWidth: 10,
  markerHeight: 42,
  markerGap: 26
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

const ai = {
  width: 48,
  height: 88,
  x: 0,
  y: 140,
  speedY: 225,
  steerRate: 215,
  reactionTime: 0.14,
  reactionTimer: 0,
  targetX: 0,
  bias: 0,
  biasTimer: 0,
  weaveTime: 0,
  weavePhase: Math.random() * Math.PI * 2,
  color: '#ef4444'
};

let gameOver = false;
let scoreSeconds = 0;
let distance = 0;
let bestDistance = Number(localStorage.getItem('bestDistance')) || 0;
let lastTimestamp = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function resetGame() {
  player.x = ROAD_X + ROAD_WIDTH * 0.35;
  player.y = GAME_HEIGHT - player.height - 24;

  ai.x = ROAD_X + ROAD_WIDTH * 0.6;
  ai.y = 130;
  ai.reactionTimer = 0;
  ai.targetX = ai.x;
  ai.bias = randomRange(-40, 40);
  ai.biasTimer = randomRange(0.8, 1.5);
  ai.weaveTime = 0;

  road.dashOffset = 0;

  gameOver = false;
  scoreSeconds = 0;
  distance = 0;
  lastTimestamp = 0;
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

function updateAI(dt) {
  // AI continuously moves down the road toward the player.
  ai.y += ai.speedY * dt;

  // Wrap AI back to top after it passes beyond the bottom of the canvas.
  if (ai.y > GAME_HEIGHT + 30) {
    ai.y = -ai.height - 10;
    ai.x = clamp(ai.x + randomRange(-60, 60), ROAD_X, ROAD_RIGHT - ai.width);
  }

  // Periodically change block side so AI does not mirror perfectly.
  ai.biasTimer -= dt;
  if (ai.biasTimer <= 0) {
    ai.biasTimer = randomRange(0.8, 1.5);
    ai.bias = randomRange(-65, 65);
  }

  // Add subtle weaving for pass opportunities.
  ai.weaveTime += dt;
  const weave = Math.sin(ai.weaveTime * 3.2 + ai.weavePhase) * 18;

  // When cars are closer in Y, AI tries harder to block.
  const yGap = Math.abs((player.y + player.height * 0.5) - (ai.y + ai.height * 0.5));
  const blockStrength = yGap < 140 ? 1 : 0.45;

  // Simulate reaction delay: target updates only every short interval.
  ai.reactionTimer -= dt;
  if (ai.reactionTimer <= 0) {
    ai.reactionTimer = ai.reactionTime + randomRange(0.01, 0.06);
    const playerCenterX = player.x + player.width * 0.5;
    const desiredCenterX = playerCenterX + ai.bias * blockStrength + weave;
    ai.targetX = desiredCenterX - ai.width * 0.5;
  }

  // Smooth steering toward delayed target; capped turn speed keeps AI beatable.
  const deltaX = ai.targetX - ai.x;
  const maxStep = ai.steerRate * dt;
  ai.x += clamp(deltaX, -maxStep, maxStep);

  // Keep AI always inside road bounds.
  ai.x = clamp(ai.x, ROAD_X, ROAD_RIGHT - ai.width);
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
  if (gameOver) {
    return;
  }

  handleInput(dt);
  updateAI(dt);

  road.dashOffset = (road.dashOffset + road.scrollSpeed * dt) % (road.markerHeight + road.markerGap);

  scoreSeconds += dt;
  distance += road.scrollSpeed * dt;

  if (checkCollision(player, ai)) {
    const currentDistance = Math.floor(distance);
    if (currentDistance > bestDistance) {
      bestDistance = currentDistance;
      localStorage.setItem('bestDistance', bestDistance);
    }

    gameOver = true;
  }
}

function drawRoad() {
  // Grass/background shoulders
  ctx.fillStyle = '#205a2f';
  ctx.fillRect(0, 0, ROAD_X, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT, 0, GAME_WIDTH - ROAD_RIGHT, GAME_HEIGHT);

  // Road base
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, GAME_HEIGHT);

  // Road edge lines
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ROAD_X + 2, 0, 4, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT - 6, 0, 4, GAME_HEIGHT);

  // Scrolling lane markers
  ctx.fillStyle = '#f9fafb';
  const laneSpacing = ROAD_WIDTH / LANE_COUNT;
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const laneX = ROAD_X + laneSpacing * lane - road.markerWidth / 2;
    for (let y = -road.markerHeight; y < GAME_HEIGHT + road.markerHeight; y += road.markerHeight + road.markerGap) {
      const drawY = y + road.dashOffset;
      ctx.fillRect(laneX, drawY, road.markerWidth, road.markerHeight);
    }
  }
}

function drawCar(car) {
  ctx.fillStyle = car.color;
  ctx.fillRect(car.x, car.y, car.width, car.height);

  // Windshield detail for readability
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(car.x + 8, car.y + 10, car.width - 16, 20);
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

function drawGameOver() {
  if (!gameOver) {
    return;
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 62px Arial';
  ctx.fillText('Game Over', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);

  ctx.font = '26px Arial';
  ctx.fillText(`Best Distance: ${bestDistance} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 22);

  ctx.font = '24px Arial';
  ctx.fillText('Press Enter or Tap to restart', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 52);
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawRoad();
  drawCar(player);
  drawCar(ai);
  drawHUD();
  drawGameOver();
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

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = true;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = true;
  }

  if (event.code === 'Enter' && gameOver) {
    resetGame();
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

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();

  if (gameOver) {
    resetGame();
    return;
  }

  const touch = event.touches[0];
  if (touch) {
    setTouchInput(touch.clientX);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (touch) {
    setTouchInput(touch.clientX);
  }
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  event.preventDefault();
  if (event.touches.length === 0) {
    clearTouchInput();
  }
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
  clearTouchInput();
});

resetGame();
requestAnimationFrame(gameLoop);
