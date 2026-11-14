// Galaga - Flask 웹 버전 (원본 Java GalagaGame.java의 규칙·수치를 그대로 옮김)
(() => {
  "use strict";

  const W = 600, H = 800;
  const TICK_MS = 10; // 원본 Timer(10ms)와 같은 논리 틱

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nameInput = document.getElementById("name");
  const saveBtn = document.getElementById("save");
  const statusEl = document.getElementById("status");
  const boardEl = document.getElementById("board");

  const images = {};
  for (const key of ["player", "enemy", "boss"]) {
    const im = new Image();
    im.src = canvas.dataset[key];
    images[key] = im;
  }

  // ---------- 유틸 ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // 별 배경은 고정 시드로 항상 같은 위치에 그림 (원본 Random(42)과 같은 의도)
  let seed = 42;
  const seeded = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const STARS = Array.from({ length: 80 }, () => [
    Math.floor(seeded() * 600),
    Math.floor(seeded() * 800),
  ]);

  // ---------- 바운드 ----------
  const bulletBox = (b) => ({ x: b.x - 2, y: b.y, w: 4, h: 10 });
  const enemyBox = (e) => ({ x: e.x - 22, y: e.y, w: 44, h: 44 });
  const playerBox = (p) => ({ x: p.x - 30, y: p.y - 60, w: 60, h: 60 });
  const bossBox = (b) => ({ x: b.x - 75, y: b.y - 50, w: 150, h: 100 });
  const itemBox = (it) => ({ x: it.x - 10, y: it.y - 10, w: 20, h: 20 });

  // ---------- 게임 상태 ----------
  let G = null;

  function newGame() {
    G = {
      state: { score: 0, level: 1, lives: 3, gameOver: false, gameClear: false },
      player: { x: 300, y: H - 80, inv: 0 },
      enemies: [],
      bullets: [],
      items: [],
      boss: null,
      bossStage: false,
      enemyDir: 1,
      enemyMoveTimer: 0,
      enemyShootTimer: 0,
      keys: { left: false, right: false, up: false, down: false, space: false, z: false },
      shootCd: 0,
      missileCd: 0,
      bombCd: 0,
      rapid: 0,
      submitted: false,
    };
    spawnEnemies();
    updateSubmitUI();
  }

  function spawnEnemies() {
    G.enemies = [];
    const rows = 4, cols = 8, startX = 50, startY = 80, gapX = 68, gapY = 56;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        G.enemies.push({ x: startX + c * gapX, y: startY + r * gapY, hp: 1, points: 100, active: true });
  }

  function makeBoss(level) {
    const maxHp = 10 + level * 5;
    return {
      x: W / 2, y: -80, targetY: 100,
      hp: maxHp, maxHp,
      points: 1000 + level * 500,
      phase: 1, moveDir: 1, moveTick: 0,
      entranceTick: 60,
      active: true,
    };
  }

  const bossEntering = (b) => b.entranceTick > 0;

  // ---------- 발사 / 아이템 ----------
  function bullet(x, y, fromPlayer, dx = 0, dy = fromPlayer ? -12 : 5) {
    return { x, y, dx, dy, fromPlayer, active: true };
  }

  function maybeDropItem(x, y) {
    if (Math.random() < 0.20) {
      G.items.push({ x, y, type: Math.floor(Math.random() * 3), tick: 0, active: true });
    }
  }
  // 0: LIFE, 1: RAPIDFIRE, 2: SHIELD
  function applyItem(type) {
    if (type === 0) { if (G.state.lives < 5) G.state.lives++; }
    else if (type === 1) { G.rapid = 300; }
    else if (type === 2) { G.player.inv = Math.max(G.player.inv, 180); }
  }

  // ---------- 적 / 보스 ----------
  function loseLife() {
    G.state.lives--;
    if (G.state.lives <= 0) G.state.gameOver = true;
  }

  function killBoss() {
    G.boss = null;
    G.state.score += 2000;
    G.state.level++;
    G.bossStage = false;
    spawnEnemies();
    if (G.state.level > 9) G.state.gameClear = true;
  }

  function damageBoss() {
    G.boss.hp--;
    if (G.boss.hp <= 0) { killBoss(); return true; }
    return false;
  }

  function updateEnemies() {
    const { state } = G;
    const speed = 15 - Math.min(state.level * 2, 10);
    G.enemyMoveTimer++;
    if (G.enemyMoveTimer >= speed) {
      G.enemyMoveTimer = 0;
      let hitWall = false;
      for (const en of G.enemies) {
        en.x += G.enemyDir * 8;
        if (en.x < 20 || en.x > W - 20) hitWall = true;
      }
      if (hitWall) {
        G.enemyDir = -G.enemyDir;
        for (const en of G.enemies) en.y += 20;
      }
      // 적이 플레이어 라인까지 내려오면 게임오버
      for (const en of G.enemies) {
        if (en.y > H - 80) { state.gameOver = true; return; }
      }
    }

    const shootInterval = Math.max(60 - state.level * 5, 20);
    G.enemyShootTimer++;
    if (G.enemyShootTimer >= shootInterval && G.enemies.length > 0) {
      G.enemyShootTimer = 0;
      const shooter = G.enemies[Math.floor(Math.random() * G.enemies.length)];
      G.bullets.push(bullet(shooter.x, shooter.y + 44, false));
    }
  }

  function updateBoss() {
    const b = G.boss;
    if (!b) return;

    if (bossEntering(b)) {
      if (b.y < b.targetY) b.y += 4;
      else { b.y = b.targetY; b.entranceTick = 0; }
      return;
    }

    b.phase = b.hp <= Math.floor(b.maxHp / 2) ? 2 : 1;
    b.moveTick++;
    const level = G.state.level;
    const speed = b.phase === 2 ? 2 + Math.floor(level / 2) : 1 + Math.floor(level / 3);

    b.x += b.moveDir * speed;
    if (b.phase === 2) {
      // Java (int) 캐스트처럼 0 방향으로 버림
      b.y += Math.trunc(Math.sin(b.moveTick * 0.04) * 1.5);
      b.y = clamp(b.y, 80, 250);
    }
    if (b.x < 60 || b.x > W - 60) b.moveDir = -b.moveDir;

    const shootRate = b.phase === 2 ? 50 : 80;
    if (b.moveTick % shootRate === 0) {
      G.bullets.push(bullet(b.x - 20, b.y + 55, false));
      G.bullets.push(bullet(b.x, b.y + 55, false));
      G.bullets.push(bullet(b.x + 20, b.y + 55, false));
    }
    if (b.phase === 2 && b.moveTick % 100 === 0) {
      for (let i = -2; i <= 2; i++) G.bullets.push(bullet(b.x + i * 18, b.y + 55, false));
    }
  }

  // ---------- 폭탄 (X) ----------
  function triggerBomb() {
    if (!G.bossStage) {
      for (const en of G.enemies) {
        if (en.active) {
          en.active = false;
          G.state.score += en.points;
          maybeDropItem(en.x, en.y);
        }
      }
      G.enemies = G.enemies.filter((en) => en.active);
    } else if (G.boss) {
      for (let i = 0; i < 3; i++) {
        if (!G.boss) break;
        if (damageBoss()) break;
      }
    }
  }

  // ---------- 충돌 ----------
  function checkCollisions() {
    const { state, player } = G;

    // 플레이어 총알 vs 적 / 보스
    for (const b of G.bullets) {
      if (!b.fromPlayer) continue;
      if (!G.bossStage) {
        for (const en of G.enemies) {
          if (en.active && b.active && overlaps(bulletBox(b), enemyBox(en))) {
            b.active = false;
            en.hp--;
            if (en.hp <= 0) {
              en.active = false;
              state.score += en.points;
              maybeDropItem(en.x, en.y);
            }
          }
        }
        G.enemies = G.enemies.filter((en) => en.active);
      } else if (G.boss && !bossEntering(G.boss)) {
        if (b.active && overlaps(bulletBox(b), bossBox(G.boss))) {
          b.active = false;
          damageBoss();
        }
      }
    }

    // 적 총알 vs 플레이어
    if (player.inv <= 0) {
      for (const b of G.bullets) {
        if (b.fromPlayer || !b.active) continue;
        if (overlaps(bulletBox(b), playerBox(player))) {
          b.active = false;
          loseLife();
          player.inv = 120;
          if (state.gameOver) return;
        }
      }
    }

    // 적기와 플레이어 직접 충돌
    for (const en of G.enemies) {
      if (en.active && overlaps(enemyBox(en), playerBox(player))) {
        state.gameOver = true;
        return;
      }
    }
  }

  // ---------- 한 틱 갱신 (원본 actionPerformed 순서 그대로) ----------
  function tick() {
    const { state, player, keys } = G;
    if (state.gameOver || state.gameClear) return;

    if (keys.left) player.x = Math.max(30, player.x - 6);
    if (keys.right) player.x = Math.min(W - 30, player.x + 6);
    if (keys.up) player.y = Math.max(H / 2, player.y - 6);
    if (keys.down) player.y = Math.min(H - 10, player.y + 6);
    if (player.inv > 0) player.inv--;

    if (G.rapid > 0) G.rapid--;
    const baseCd = G.rapid > 0 ? 7 : 18;
    const muzzleY = player.y - 30;

    if (keys.space && G.shootCd <= 0) {
      G.bullets.push(bullet(player.x, muzzleY, true));
      G.shootCd = baseCd;
    }
    if (G.shootCd > 0) G.shootCd--;

    if (keys.z && G.missileCd <= 0) {
      G.bullets.push(bullet(player.x, muzzleY, true));
      G.bullets.push(bullet(player.x - 18, muzzleY, true, -2, -8));
      G.bullets.push(bullet(player.x + 18, muzzleY, true, 2, -8));
      G.missileCd = 25;
    }
    if (G.missileCd > 0) G.missileCd--;

    if (G.bombCd > 0) G.bombCd--;

    for (const it of G.items) {
      it.y += 2;
      it.tick++;
      if (it.y > H) it.active = false;
    }
    G.items = G.items.filter((it) => it.active);
    for (const it of G.items) {
      if (it.active && overlaps(itemBox(it), playerBox(player))) {
        applyItem(it.type);
        it.active = false;
      }
    }

    for (const b of G.bullets) {
      b.x += b.dx;
      b.y += b.dy;
      if (b.y < 0 || b.y > H || b.x < 0 || b.x > W) b.active = false;
    }
    G.bullets = G.bullets.filter((b) => b.active);

    if (!G.bossStage) updateEnemies();
    else updateBoss();

    checkCollisions();

    // 레벨 클리어 판정 (3, 6, 9레벨은 보스전)
    if (!G.bossStage && G.enemies.length === 0 && !state.gameOver) {
      if (state.level % 3 === 0) {
        G.bossStage = true;
        G.boss = makeBoss(state.level);
      } else {
        state.level++;
        G.enemyDir = 1;
        spawnEnemies();
      }
    }
  }

  // ---------- 렌더링 ----------
  function drawSprite(key, x, y, w, h) {
    const im = images[key];
    if (im.complete && im.naturalWidth > 0) ctx.drawImage(im, x, y, w, h);
  }

  function drawStars() {
    ctx.fillStyle = "rgba(200,200,200,0.47)";
    for (const [sx, sy] of STARS) ctx.fillRect(sx, sy, 2, 2);
  }

  function drawBoss(b) {
    const bw = 150, bh = 100;
    drawSprite("boss", b.x - bw / 2, b.y - bh / 2, bw, bh);
    if (b.phase === 2) {
      ctx.fillStyle = "rgba(255,0,0,0.235)";
      ctx.fillRect(b.x - bw / 2, b.y - bh / 2, bw, bh);
    }
    // 체력바
    ctx.fillStyle = "#555";
    ctx.fillRect(W / 2 - 100, 35, 200, 10);
    ctx.fillStyle = b.phase === 2 ? "red" : "#0f0";
    ctx.fillRect(W / 2 - 100, 35, Math.floor(200 * b.hp / b.maxHp), 10);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Arial";
    ctx.fillText("BOSS HP", W / 2 - 22, 32);
    if (b.phase === 2) {
      ctx.fillStyle = "orange";
      ctx.font = "bold 13px Arial";
      ctx.fillText("RAGE!", b.x - 18, b.y - bh / 2 - 10);
    }
  }

  const ITEM_COLORS = ["rgb(255,80,80)", "rgb(80,200,255)", "rgb(80,255,120)"];
  const ITEM_ICONS = ["❤", "⚡", "🔰"];

  function drawItem(it) {
    if (Math.floor(it.tick / 5) % 2 !== 0) return;
    ctx.fillStyle = ITEM_COLORS[it.type];
    ctx.beginPath();
    ctx.arc(it.x, it.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ITEM_ICONS[it.type], it.x, it.y + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawBullet(b) {
    if (b.fromPlayer && b.dx !== 0) ctx.fillStyle = "rgb(255,200,0)";
    else ctx.fillStyle = b.fromPlayer ? "cyan" : "red";
    ctx.fillRect(b.x - 2, b.y, 4, 10);
  }

  function drawPlayer(p) {
    if (p.inv > 0 && Math.floor(p.inv / 10) % 2 === 0) return;
    drawSprite("player", p.x - 30, p.y - 60, 60, 60);
  }

  function drawHUD() {
    const { state } = G;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.fillText("SCORE: " + state.score, 10, 20);
    ctx.fillText("LEVEL: " + state.level, W / 2 - 30, 20);

    ctx.fillStyle = "cyan";
    for (let i = 0; i < state.lives; i++) {
      const x0 = W - 30 - i * 22;
      ctx.beginPath();
      ctx.moveTo(x0, 10);
      ctx.lineTo(x0 - 10, 22);
      ctx.lineTo(x0 + 10, 22);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = "13px Arial";
    if (G.rapid > 0) {
      ctx.fillStyle = "rgb(80,200,255)";
      ctx.fillText("⚡RAPID:" + (Math.floor(G.rapid / 60) + 1) + "s", 10, 42);
    }
    if (G.bombCd <= 0) {
      ctx.fillStyle = "rgb(255,160,0)";
      ctx.fillText("[X] BOMB READY", 10, H - 14);
    }
    ctx.font = "11px Arial";
    ctx.fillStyle = "rgb(180,180,180)";
    ctx.fillText("SPACE:발사  Z:미사일  X:폭탄", W / 2 - 85, H - 14);

    if (G.bossStage && G.boss && bossEntering(G.boss)) {
      ctx.fillStyle = "magenta";
      ctx.font = "bold 28px Arial";
      ctx.fillText("⚠ BOSS INCOMING ⚠", W / 2 - 120, H / 2);
    }
  }

  function drawOverlay(title, color) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 44px Arial";
    ctx.fillStyle = color;
    ctx.fillText(title, W / 2 - 130, H / 2 - 30);
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText("SCORE: " + G.state.score, W / 2 - 60, H / 2 + 20);
    ctx.font = "18px Arial";
    ctx.fillStyle = "gray";
    ctx.fillText("Press R to Restart", W / 2 - 70, H / 2 + 60);
  }

  function render() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawStars();

    if (G.state.gameOver) return drawOverlay("GAME OVER", "red");
    if (G.state.gameClear) return drawOverlay("GAME CLEAR!", "yellow");

    for (const en of G.enemies) drawSprite("enemy", en.x - 22, en.y, 44, 44);
    if (G.boss) drawBoss(G.boss);
    for (const it of G.items) drawItem(it);
    for (const b of G.bullets) drawBullet(b);

    if (G.bombCd > 0) {
      ctx.fillStyle = "rgba(255,100,0,0.59)";
      ctx.fillRect(0, H - 8, Math.floor(W * (180 - G.bombCd) / 180), 6);
    }
    drawPlayer(G.player);
    drawHUD();
  }

  // ---------- 입력 ----------
  const KEY_MAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    Space: "space", KeyZ: "z",
  };

  function releaseKeys() {
    if (!G) return;
    for (const k in G.keys) G.keys[k] = false;
  }

  document.addEventListener("keydown", (e) => {
    // 이름 입력 중에는 게임 키를 무시하고 기본 동작(글자 입력)을 그대로 둠
    if (document.activeElement === nameInput) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();

    const action = KEY_MAP[e.code];
    if (action) G.keys[action] = true;

    if (e.code === "KeyX" && !e.repeat) {
      if (G.bombCd <= 0 && !G.state.gameOver && !G.state.gameClear) {
        triggerBomb();
        G.bombCd = 180;
      }
    }
    if (e.code === "KeyR" && (G.state.gameOver || G.state.gameClear)) newGame();
  });

  document.addEventListener("keyup", (e) => {
    const action = KEY_MAP[e.code];
    if (action) G.keys[action] = false;
  });

  window.addEventListener("blur", releaseKeys);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    G.player.x = clamp(x, 30, W - 30);
  });

  // ---------- 최고 점수 (Flask API) ----------
  function renderBoard(list) {
    boardEl.innerHTML = "";
    for (const row of list) {
      const li = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = row.name;
      const score = document.createElement("span");
      score.textContent = row.score;
      li.append(name, score);
      boardEl.append(li);
    }
  }

  async function loadBoard() {
    try {
      const res = await fetch("/api/scores");
      renderBoard(await res.json());
    } catch {
      statusEl.textContent = "점수판을 불러오지 못했습니다.";
    }
  }

  function updateSubmitUI() {
    const over = G.state.gameOver || G.state.gameClear;
    saveBtn.disabled = !over || G.submitted;
    if (G.submitted) statusEl.textContent = "등록되었습니다.";
    else if (over) statusEl.textContent = "점수를 등록할 수 있습니다.";
    else statusEl.textContent = "";
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.value, score: G.state.score }),
      });
      if (!res.ok) throw new Error("bad response");
      G.submitted = true;
      renderBoard(await res.json());
    } catch {
      statusEl.textContent = "등록에 실패했습니다. 다시 시도해 주세요.";
      saveBtn.disabled = false;
      return;
    }
    updateSubmitUI();
  });

  // ---------- 메인 루프 ----------
  let last = performance.now();
  let acc = 0;
  let wasOver = false;

  function frame(now) {
    acc += Math.min(now - last, 250); // 탭 전환 등으로 시간이 튀는 것 방지
    last = now;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      tick();
    }
    const over = G.state.gameOver || G.state.gameClear;
    if (over !== wasOver) { wasOver = over; updateSubmitUI(); }
    render();
    requestAnimationFrame(frame);
  }

  newGame();
  loadBoard();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
