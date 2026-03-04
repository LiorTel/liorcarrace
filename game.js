const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WORLD_W = 800;
const WORLD_H = 600;
canvas.width = WORLD_W;
canvas.height = WORLD_H;

const GAME_WIDTH = WORLD_W;
const GAME_HEIGHT = WORLD_H;

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

const touchInput = {
  left: false,
  right: false,
  activePointerId: null
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

  clearTouchDirection();
  touchInput.activePointerId = null;
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const worldX = ((clientX - rect.left) / rect.width) * WORLD_W;
  const worldY = ((clientY - rect.top) / rect.height) * WORLD_H;
  return { x: worldX, y: worldY };
}

function setTouchDirectionFromClient(clientX, clientY) {
  const { x, y } = screenToWorld(clientX, clientY);
  const insideCanvas = x >= 0 && x <= WORLD_W && y >= 0 && y <= WORLD_H;

  if (!insideCanvas) {
    clearTouchDirection();
    return;
  }

  touchInput.left = x < WORLD_W * 0.5;
  touchInput.right = !touchInput.left;
}

function clearTouchDirection() {
  touchInput.left = false;
  touchInput.right = false;
}

function updatePlayer(dt) {
  const moveLeft = keys.left || touchInput.left;
  const moveRight = keys.right || touchInput.right;

  if (moveLeft) {
    player.x -= player.speed * dt;
  }
  if (moveRight) {
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

  updatePlayer(dt);
  updateAI(dt);

  road.dashOffset = (road.dashOffset + road.scrollSpeed * dt) % (road.markerHeight + road.markerGap);

  scoreSeconds += dt;
  distance += road.scrollSpeed * dt;

  if (checkCollision(player, ai)) {
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
  ctx.fillText('Press Enter to restart', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 42);
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

function onPointerDown(event) {
  event.preventDefault();

  if (gameOver) {
    resetGame();
    return;
  }

  touchInput.activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  setTouchDirectionFromClient(event.clientX, event.clientY);
}

function onPointerMove(event) {
  if (touchInput.activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  setTouchDirectionFromClient(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (touchInput.activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  touchInput.activePointerId = null;
  clearTouchDirection();
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

canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('pointermove', onPointerMove, { passive: false });
canvas.addEventListener('pointerup', onPointerUp, { passive: false });
canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
canvas.addEventListener('pointerleave', onPointerUp, { passive: false });


resetGame();
requestAnimationFrame(gameLoop);
