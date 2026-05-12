const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.querySelector("#scoreValue");
const bestValue = document.querySelector("#bestValue");
const finalScore = document.querySelector("#finalScore");
const finalBest = document.querySelector("#finalBest");
const startScreen = document.querySelector("#startScreen");
const gameOverScreen = document.querySelector("#gameOverScreen");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const comboBadge = document.querySelector("#comboBadge");
const leftControl = document.querySelector("#leftControl");
const rightControl = document.querySelector("#rightControl");

const STORAGE_KEY = "starway-sprint-best-score";
const TWO_PI = Math.PI * 2;

const palette = {
  teal: "#5de0c6",
  coral: "#ff6b6b",
  gold: "#ffd166",
  violet: "#8f7aff",
  text: "#f6f3ea",
};

let dpr = 1;
let width = 960;
let height = 640;
let lastTime = 0;
let animationFrame = 0;
let pointerActive = false;

const keys = {
  left: false,
  right: false,
};

const game = {
  mode: "ready",
  score: 0,
  best: readBestScore(),
  elapsed: 0,
  obstacleTimer: 0,
  starTimer: 0,
  shake: 0,
};

const player = {
  x: 480,
  y: 540,
  radius: 19,
  targetX: 480,
  tilt: 0,
};

let obstacles = [];
let stars = [];
let particles = [];
let starfield = [];

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // The game still works when storage is unavailable.
  }
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(320, Math.floor(rect.width));
  height = Math.max(420, Math.floor(rect.height));

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  player.radius = clamp(width * 0.024, 15, 22);
  player.y = height - clamp(height * 0.14, 68, 104);
  player.x = clamp(player.x || width / 2, player.radius + 10, width - player.radius - 10);
  player.targetX = clamp(player.targetX || player.x, player.radius + 10, width - player.radius - 10);

  createStarfield();
}

function createStarfield() {
  const count = clamp(Math.floor((width * height) / 9800), 44, 120);
  starfield = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: random(0.8, 2.3),
    speed: random(14, 46),
    alpha: random(0.22, 0.82),
  }));
}

function setScreen(mode) {
  startScreen.hidden = mode !== "ready";
  gameOverScreen.hidden = mode !== "over";
}

function updateScoreText() {
  const score = Math.floor(game.score);
  scoreValue.textContent = String(score);
  bestValue.textContent = String(game.best);
}

function resetGame() {
  game.score = 0;
  game.elapsed = 0;
  game.obstacleTimer = 0.35;
  game.starTimer = 0.9;
  game.shake = 0;
  obstacles = [];
  stars = [];
  particles = [];
  player.x = width / 2;
  player.targetX = player.x;
  player.tilt = 0;
  updateScoreText();
}

function startGame() {
  resetGame();
  game.mode = "playing";
  setScreen("playing");
  lastTime = performance.now();
}

function endGame() {
  if (game.mode !== "playing") {
    return;
  }

  game.mode = "over";
  game.shake = 14;
  const roundedScore = Math.floor(game.score);
  if (roundedScore > game.best) {
    game.best = roundedScore;
    writeBestScore(game.best);
  }

  finalScore.textContent = String(roundedScore);
  finalBest.textContent = String(game.best);
  updateScoreText();
  setScreen("over");
  burst(player.x, player.y, palette.coral, 28);
}

function showCombo(points) {
  comboBadge.textContent = `+${points}`;
  comboBadge.classList.remove("show");
  void comboBadge.offsetWidth;
  comboBadge.classList.add("show");
}

function spawnObstacle() {
  const radius = random(15, clamp(width * 0.045, 24, 38));
  const speed = random(150, 225) + Math.min(game.elapsed * 4.2, 180);
  obstacles.push({
    x: random(radius + 10, width - radius - 10),
    y: -radius - 10,
    radius,
    speed,
    rotation: random(0, TWO_PI),
    rotationSpeed: random(-2.2, 2.2),
    sides: Math.floor(random(7, 11)),
    wobble: random(0.82, 1.18),
  });
}

function spawnStar() {
  const radius = clamp(width * 0.02, 12, 17);
  stars.push({
    x: random(radius + 16, width - radius - 16),
    y: -radius - 20,
    radius,
    speed: random(116, 178) + Math.min(game.elapsed * 2.4, 90),
    rotation: random(0, TWO_PI),
  });
}

function burst(x, y, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const angle = random(0, TWO_PI);
    const speed = random(80, 260);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.32, 0.74),
      maxLife: 0.74,
      size: random(2, 5),
      color,
    });
  }
}

function update(delta) {
  updateStarfield(delta);

  if (game.mode === "playing") {
    updatePlayer(delta);
    updateSpawns(delta);
    updateEntities(delta);
    updateCollisions();
    game.score += delta * 11;
    game.elapsed += delta;
    updateScoreText();
  } else {
    const drift = Math.sin(performance.now() / 700) * 0.7;
    player.x = clamp(player.x + drift, player.radius + 10, width - player.radius - 10);
    player.targetX = player.x;
  }

  updateParticles(delta);
  game.shake = Math.max(0, game.shake - delta * 32);
}

function updateStarfield(delta) {
  for (const star of starfield) {
    star.y += star.speed * delta;
    if (star.y > height + 6) {
      star.y = -6;
      star.x = Math.random() * width;
    }
  }
}

function updatePlayer(delta) {
  const previousX = player.x;
  const keyboardDirection = Number(keys.right) - Number(keys.left);
  if (keyboardDirection !== 0) {
    player.x += keyboardDirection * clamp(width * 0.62, 360, 620) * delta;
    player.targetX = player.x;
  } else {
    player.x += (player.targetX - player.x) * Math.min(1, delta * 11);
  }

  player.x = clamp(player.x, player.radius + 12, width - player.radius - 12);
  player.tilt += ((player.x - previousX) * 0.05 - player.tilt) * Math.min(1, delta * 9);
}

function updateSpawns(delta) {
  const difficulty = Math.min(game.elapsed / 42, 1);
  game.obstacleTimer -= delta;
  game.starTimer -= delta;

  if (game.obstacleTimer <= 0) {
    spawnObstacle();
    game.obstacleTimer = random(0.42, 0.78) - difficulty * 0.22;
  }

  if (game.starTimer <= 0) {
    spawnStar();
    game.starTimer = random(1.05, 1.65) - difficulty * 0.24;
  }
}

function updateEntities(delta) {
  for (const obstacle of obstacles) {
    obstacle.y += obstacle.speed * delta;
    obstacle.rotation += obstacle.rotationSpeed * delta;
  }

  for (const star of stars) {
    star.y += star.speed * delta;
    star.rotation += delta * 2.6;
  }

  obstacles = obstacles.filter((obstacle) => obstacle.y < height + obstacle.radius + 40);
  stars = stars.filter((star) => star.y < height + star.radius + 40);
}

function updateCollisions() {
  for (const obstacle of obstacles) {
    if (distance(player, obstacle) < player.radius + obstacle.radius * 0.76) {
      endGame();
      return;
    }
  }

  for (let i = stars.length - 1; i >= 0; i -= 1) {
    const star = stars[i];
    if (distance(player, star) < player.radius + star.radius) {
      stars.splice(i, 1);
      game.score += 20;
      showCombo(20);
      burst(star.x, star.y, palette.gold, 12);
    }
  }
}

function updateParticles(delta) {
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 90 * delta;
    particle.life -= delta;
  }

  particles = particles.filter((particle) => particle.life > 0);
}

function draw() {
  ctx.save();

  if (game.shake > 0) {
    ctx.translate(random(-game.shake, game.shake), random(-game.shake, game.shake));
  }

  drawBackground();
  drawStars();
  drawTrack();
  drawCollectibles();
  drawObstacles();
  drawPlayer();
  drawParticles();

  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#17151f");
  gradient.addColorStop(0.44, "#10161a");
  gradient.addColorStop(1, "#1e1718");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawStars() {
  for (const star of starfield) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = palette.text;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTrack() {
  const center = width / 2;
  const topWidth = width * 0.24;
  const bottomWidth = width * 0.9;
  const horizon = height * 0.08;

  ctx.save();
  const trackGradient = ctx.createLinearGradient(0, horizon, 0, height);
  trackGradient.addColorStop(0, "rgba(93, 224, 198, 0.04)");
  trackGradient.addColorStop(1, "rgba(93, 224, 198, 0.15)");

  ctx.beginPath();
  ctx.moveTo(center - topWidth / 2, horizon);
  ctx.lineTo(center + topWidth / 2, horizon);
  ctx.lineTo(center + bottomWidth / 2, height + 16);
  ctx.lineTo(center - bottomWidth / 2, height + 16);
  ctx.closePath();
  ctx.fillStyle = trackGradient;
  ctx.fill();

  ctx.strokeStyle = "rgba(93, 224, 198, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center - topWidth / 2, horizon);
  ctx.lineTo(center - bottomWidth / 2, height + 16);
  ctx.moveTo(center + topWidth / 2, horizon);
  ctx.lineTo(center + bottomWidth / 2, height + 16);
  ctx.stroke();

  const lanes = [-0.24, 0, 0.24];
  ctx.strokeStyle = "rgba(255, 209, 102, 0.2)";
  ctx.lineWidth = 1;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(center + lane * topWidth, horizon + 8);
    ctx.lineTo(center + lane * bottomWidth, height + 20);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(clamp(player.tilt, -0.55, 0.55));

  const r = player.radius;
  const flame = game.mode === "playing" ? 1 + Math.sin(performance.now() / 70) * 0.22 : 0.72;

  ctx.beginPath();
  ctx.moveTo(0, r * 1.26);
  ctx.lineTo(-r * 0.5, r * 0.34);
  ctx.lineTo(r * 0.5, r * 0.34);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 209, 102, 0.88)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, r * 1.95 * flame);
  ctx.lineTo(-r * 0.3, r * 0.82);
  ctx.lineTo(r * 0.3, r * 0.82);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 107, 107, 0.72)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -r * 1.35);
  ctx.lineTo(r * 0.95, r * 0.9);
  ctx.lineTo(0, r * 0.48);
  ctx.lineTo(-r * 0.95, r * 0.9);
  ctx.closePath();
  ctx.fillStyle = palette.teal;
  ctx.shadowColor = "rgba(93, 224, 198, 0.56)";
  ctx.shadowBlur = 22;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.76);
  ctx.lineTo(r * 0.32, r * 0.18);
  ctx.lineTo(-r * 0.32, r * 0.18);
  ctx.closePath();
  ctx.fillStyle = "#172026";
  ctx.fill();

  ctx.restore();
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(obstacle.rotation);
    ctx.beginPath();
    for (let i = 0; i < obstacle.sides; i += 1) {
      const angle = (i / obstacle.sides) * TWO_PI;
      const radius = obstacle.radius * (i % 2 === 0 ? obstacle.wobble : 0.74);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "#725b5b";
    ctx.strokeStyle = "rgba(255, 107, 107, 0.72)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255, 107, 107, 0.25)";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-obstacle.radius * 0.2, -obstacle.radius * 0.16, obstacle.radius * 0.18, 0, TWO_PI);
    ctx.fillStyle = "rgba(30, 24, 26, 0.38)";
    ctx.fill();
    ctx.restore();
  }
}

function drawCollectibles() {
  for (const star of stars) {
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(star.rotation);
    drawStarShape(star.radius);
    ctx.restore();
  }
}

function drawStarShape(radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i / 10) * TWO_PI;
    const pointRadius = i % 2 === 0 ? radius : radius * 0.44;
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = palette.gold;
  ctx.shadowColor = "rgba(255, 209, 102, 0.55)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function loop(now) {
  const delta = Math.min((now - lastTime) / 1000 || 0, 0.033);
  lastTime = now;
  update(delta);
  draw();
  animationFrame = requestAnimationFrame(loop);
}

function setTargetFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  player.targetX = clamp(x, player.radius + 12, width - player.radius - 12);
}

function handlePointerDown(event) {
  event.preventDefault();
  if (game.mode !== "playing") {
    startGame();
    return;
  }

  pointerActive = true;
  canvas.setPointerCapture?.(event.pointerId);
  setTargetFromPointer(event);
}

function handlePointerMove(event) {
  if (game.mode !== "playing") {
    return;
  }
  if (pointerActive || event.pointerType === "mouse") {
    setTargetFromPointer(event);
  }
}

function handlePointerUp(event) {
  pointerActive = false;
  canvas.releasePointerCapture?.(event.pointerId);
}

function setControlHeld(direction, held) {
  keys[direction] = held;
  const button = direction === "left" ? leftControl : rightControl;
  button.classList.toggle("is-held", held);
}

function bindHoldButton(button, direction) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (game.mode !== "playing") {
      startGame();
    }
    button.setPointerCapture?.(event.pointerId);
    setControlHeld(direction, true);
  });

  button.addEventListener("pointerup", (event) => {
    button.releasePointerCapture?.(event.pointerId);
    setControlHeld(direction, false);
  });

  button.addEventListener("pointercancel", () => setControlHeld(direction, false));
  button.addEventListener("lostpointercapture", () => setControlHeld(direction, false));
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
    event.preventDefault();
  }

  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
    event.preventDefault();
  }

  if (event.code === "Space" || event.code === "Enter") {
    if (game.mode !== "playing") {
      startGame();
    }
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = false;
  }

  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = false;
  }
});

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
bindHoldButton(leftControl, "left");
bindHoldButton(rightControl, "right");

resizeCanvas();
setScreen("ready");
updateScoreText();
animationFrame = requestAnimationFrame((time) => {
  lastTime = time;
  loop(time);
});

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
});
