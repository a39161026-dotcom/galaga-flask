// Galaga - Flask 웹 버전 (원본 Java 갤러그의 규칙·수치 기반, 난이도·아이템 확장)
(() => {
  "use strict";

  const W = 600, H = 800;
  const TICK_MS = 10;            // 논리 틱 (100틱 = 1초)
  const TICKS_PER_SEC = 1000 / TICK_MS;

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

  function pickWeighted(list, weightOf) {
    const total = list.reduce((s, v) => s + weightOf(v), 0);
    let r = Math.random() * total;
    for (const v of list) {
      r -= weightOf(v);
      if (r < 0) return v;
    }
    return list[list.length - 1];
  }

  // 별 배경은 고정 시드로 항상 같은 위치에 그림
  let seed = 42;
  const seeded = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const STARS = Array.from({ length: 80 }, () => [
    Math.floor(seeded() * 600),
    Math.floor(seeded() * 800),
  ]);

  // ---------- 난이도 ----------
  // shootMul: 적 발사 빈도 배율 (클수록 자주 쏨)
  // speedMul: 이동 속도 배율 (클수록 빠름)
  // hpMul   : 보스 체력 배율
  const TIERS = [
    { name: "쉬움",   color: "#7fff7f", shootMul: 0.75, speedMul: 0.85, hpMul: 0.8, weight: 3 },
    { name: "보통",   color: "#ffd34d", shootMul: 1.0,  speedMul: 1.0,  hpMul: 1.0, weight: 4 },
    { name: "어려움", color: "#ff6b6b", shootMul: 1.3,  speedMul: 1.2,  hpMul: 1.3, weight: 3 },
  ];
  const STAGES_PER_ROUND = 9;    // 9단계(최종 보스) 클리어 후 다음 라운드로 넘어감

  const roundNo = () => Math.floor((G.state.level - 1) / STAGES_PER_ROUND) + 1;
  const stageNo = () => ((G.state.level - 1) % STAGES_PER_ROUND) + 1;
  const roundMul = () => 1 + 0.35 * (roundNo() - 1); // 라운드마다 난이도 35%씩 상승

  // ---------- 아이템 ----------
  const IT = { LIFE: 0, RAPID: 1, SHIELD: 2, DOUBLE: 3, PIERCE: 4, BOMB: 5, SCORE2: 6, SLOW: 7 };
  const ITEMS = [
    { color: "rgb(255,80,80)",   icon: "❤",  weight: 15 }, // LIFE
    { color: "rgb(80,200,255)",  icon: "⚡", weight: 15 }, // RAPID (속사 3초)
    { color: "rgb(80,255,120)",  icon: "🔰", weight: 10 }, // SHIELD (보호막 1.8초)
    { color: "rgb(255,140,40)",  icon: "🔫", weight: 15 }, // DOUBLE (쌍발사 3초)
    { color: "rgb(200,120,255)", icon: "🎯", weight: 12 }, // PIERCE (관통 3초)
    { color: "rgb(255,220,80)",  icon: "💣", weight: 10 }, // BOMB (폭탄 즉시 충전)
    { color: "rgb(255,215,0)",   icon: "💰", weight: 12 }, // SCORE2 (점수 2배 10초)
    { color: "rgb(120,220,255)", icon: "🧊", weight: 11 }, // SLOW (적 감속 5초)
  ];
  const ITEM_TYPES = ITEMS.map((_, i) => i);

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
      state: { score: 0, level: 1, lives: 3, gameOver: false },
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
      fx: { rapid: 0, double: 0, pierce: 0, score2: 0, slow: 0 }, // 남은 틱
      tier: TIERS[1],
      banner: 0,
      submitted: false,
    };
    spawnEnemies();
    beginStage();
    updateSubmitUI();
  }

  // 새 단계 시작: 난이도를 무작위로 뽑고 안내 배너 표시
  function beginStage() {
    G.tier = pickWeighted(TIERS, (t) => t.weight);
    G.banner = 250;
  }

  function addScore(pts) {
    G.state.score += G.fx.score2 > 0 ? pts * 2 : pts;
  }

  function spawnEnemies() {
    G.enemies = [];
    const rows = 4, cols = 8, startX = 50, startY = 80, gapX = 68, gapY = 56;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        G.enemies.push({ x: startX + c * gapX, y: startY + r * gapY, hp: 1, points: 100, active: true });
  }

  function makeBoss() {
    const maxHp = Math.round((10 + G.state.level * 5) * G.tier.hpMul * roundMul());
    return {
      x: W / 2, y: -80, targetY: 100,
      hp: maxHp, maxHp,
      points: 1000 + G.state.level * 500,
      phase: 1, moveDir: 1, moveTick: 0,
      entranceTick: 60,
      active: true,
    };
  }

  const bossEntering = (b) => b.entranceTick > 0;

  // ---------- 발사 / 아이템 ----------
  // 플레이어 총알은 관통 효과가 켜져 있을 때만 hits 집합을 가짐
  function bullet(x, y, fromPlayer, dx = 0, dy = fromPlayer ? -12 : 5) {
    const pierce = fromPlayer && G.fx.pierce > 0;
    return { x, y, dx, dy, fromPlayer, active: true, hits: pierce ? new Set() : null };
  }

  function maybeDropItem(x, y) {
    if (Math.random() < 0.20) {
      const type = pickWeighted(ITEM_TYPES, (t) => ITEMS[t].weight);
      G.items.push({ x, y, type, tick: 0, active: true });
    }
  }

  function applyItem(type) {
    switch (type) {
      case IT.LIFE:   if (G.state.lives < 5) G.state.lives++; break;
      case IT.RAPID:  G.fx.rapid = 300; break;
      case IT.SHIELD: G.player.inv = Math.max(G.player.inv, 180); break;
      case IT.DOUBLE: G.fx.double = 300; break;
      case IT.PIERCE: G.fx.pierce = 300; break;
      case IT.BOMB:   G.bombCd = 0; break;
      case IT.SCORE2: G.fx.score2 = 1000; break;
      case IT.SLOW:   G.fx.slow = 500; break;
    }
  }

  // ---------- 적 / 보스 ----------
  function loseLife() {
    G.state.lives--;
    if (G.state.lives <= 0) G.state.gameOver = true;
  }

  function killBoss() {
    G.boss = null;
    addScore(2000);
    G.state.level++;
    G.bossStage = false;
    spawnEnemies();
    beginStage();
  }

  // 보스에 1 데미지. 처치되면 true
  function damageBoss() {
    G.boss.hp--;
    if (G.boss.hp <= 0) { killBoss(); return true; }
    return false;
  }

  function updateEnemies() {
    const lvl = G.state.level;
    const slowMul = G.fx.slow > 0 ? 2 : 1;
    const baseSpeed = 15 - Math.min(lvl * 2, 10);
    const speed = Math.max(2, Math.round((baseSpeed * slowMul) / (G.tier.speedMul * roundMul())));

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
        if (en.y > H - 80) { G.state.gameOver = true; return; }
      }
    }

    const baseInterval = Math.max(60 - lvl * 5, 20);
    const interval = Math.max(8, Math.round((baseInterval * slowMul) / (G.tier.shootMul * roundMul())));
    G.enemyShootTimer++;
    if (G.enemyShootTimer >= interval && G.enemies.length > 0) {
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
    const lvl = G.state.level;
    const slowMul = G.fx.slow > 0 ? 0.5 : 1;
    const baseSpeed = b.phase === 2 ? 2 + Math.floor(lvl / 2) : 1 + Math.floor(lvl / 3);
    const speed = baseSpeed * G.tier.speedMul * roundMul() * slowMul;

    b.x += b.moveDir * speed;
    if (b.phase === 2) {
      // Java (int) 캐스트처럼 0 방향으로 버림
      b.y += Math.trunc(Math.sin(b.moveTick * 0.04) * 1.5);
      b.y = clamp(b.y, 80, 250);
    }
    if (b.x < 60 || b.x > W - 60) b.moveDir = -b.moveDir;

    const baseRate = b.phase === 2 ? 50 : 80;
    const shootRate = Math.max(20, Math.round(baseRate / (G.tier.shootMul * roundMul())));
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
          addScore(en.points);
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
      if (!b.fromPlayer || !b.active) continue;
      if (!G.bossStage) {
        for (const en of G.enemies) {
          if (!en.active || !b.active) continue;
          if (b.hits && b.hits.has(en)) continue;
          if (!overlaps(bulletBox(b), enemyBox(en))) continue;
          if (b.hits) b.hits.add(en); else b.active = false;
          if (--en.hp <= 0) {
            en.active = false;
            addScore(en.points);
            maybeDropItem(en.x, en.y);
          }
        }
        G.enemies = G.enemies.filter((en) => en.active);
      } else if (G.boss && !bossEntering(G.boss)) {
        if (b.hits && b.hits.has(G.boss)) continue;
        if (!overlaps(bulletBox(b), bossBox(G.boss))) continue;
        if (b.hits) b.hits.add(G.boss); else b.active = false;
        damageBoss();
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

  // ---------- 한 틱 갱신 (원본 actionPerformed 순서 기준) ----------
  function tick() {
    const { state, player, keys, fx } = G;
    if (state.gameOver) return;

    if (keys.left) player.x = Math.max(30, player.x - 6);
    if (keys.right) player.x = Math.min(W - 30, player.x + 6);
    if (keys.up) player.y = Math.max(H / 2, player.y - 6);
    if (keys.down) player.y = Math.min(H - 10, player.y + 6);
    if (player.inv > 0) player.inv--;

    for (const k in fx) if (fx[k] > 0) fx[k]--;
    if (G.banner > 0) G.banner--;

    const baseCd = fx.rapid > 0 ? 7 : 18;
    const muzzleY = player.y - 30;

    if (keys.space && G.shootCd <= 0) {
      const offsets = fx.double > 0 ? [-10, 10] : [0];
      for (const o of offsets) G.bullets.push(bullet(player.x + o, muzzleY, true));
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

    // 단계 클리어 판정: 단계 3, 6, 9는 보스전 (라운드마다 반복)
    if (!G.bossStage && G.enemies.length === 0 && !state.gameOver) {
      if (stageNo() % 3 === 0) {
        G.bossStage = true;
        G.boss = makeBoss();
      } else {
        state.level++;
        G.enemyDir = 1;
        spawnEnemies();
        beginStage();
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

  function drawItem(it) {
    if (Math.floor(it.tick / 5) % 2 !== 0) return;
    const info = ITEMS[it.type];
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(it.x, it.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.icon, it.x, it.y + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawBullet(b) {
    if (b.fromPlayer && b.hits) ctx.fillStyle = "rgb(200,120,255)";     // 관통탄
    else if (b.fromPlayer && b.dx !== 0) ctx.fillStyle = "rgb(255,200,0)"; // 미사일
    else ctx.fillStyle = b.fromPlayer ? "cyan" : "red";
    ctx.fillRect(b.x - 2, b.y, 4, 10);
  }

  function drawPlayer(p) {
    if (p.inv > 0 && Math.floor(p.inv / 10) % 2 === 0) return;
    drawSprite("player", p.x - 30, p.y - 60, 60, 60);
  }

  const FX_LABELS = [
    ["rapid",  "⚡ 속사",     "rgb(80,200,255)"],
    ["double", "🔫 쌍발사",   "rgb(255,140,40)"],
    ["pierce", "🎯 관통",     "rgb(200,120,255)"],
    ["score2", "💰 점수 2배", "rgb(255,215,0)"],
    ["slow",   "🧊 감속",     "rgb(120,220,255)"],
  ];

  function drawHUD() {
    const { state } = G;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.fillText("SCORE: " + state.score, 10, 20);
    ctx.fillText("LEVEL: " + state.level, W / 2 - 30, 20);

    ctx.font = "bold 13px Arial";
    ctx.fillStyle = G.tier.color;
    ctx.fillText(`ROUND ${roundNo()} · ${G.tier.name}`, W / 2 - 30, 40);

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

    // 활성 효과 목록 (남은 초)
    const rows = [];
    if (G.player.inv > 0) rows.push(["🔰 보호막", "rgb(80,255,120)", G.player.inv]);
    for (const [key, label, color] of FX_LABELS) {
      if (G.fx[key] > 0) rows.push([label, color, G.fx[key]]);
    }
    ctx.font = "13px Arial";
    rows.forEach(([label, color, ticks], i) => {
      ctx.fillStyle = color;
      ctx.fillText(`${label} ${Math.ceil(ticks / TICKS_PER_SEC)}s`, 10, 62 + i * 18);
    });

    if (G.bombCd <= 0) {
      ctx.font = "13px Arial";
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

    // 단계 시작 배너
    if (G.banner > 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px Arial";
      ctx.fillText(`STAGE ${stageNo()}`, W / 2, H / 2 - 140);
      ctx.fillStyle = G.tier.color;
      ctx.font = "bold 22px Arial";
      ctx.fillText(`${G.tier.name} 난이도`, W / 2, H / 2 - 108);
      ctx.textAlign = "start";
    }
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 48px Arial";
    ctx.fillStyle = "red";
    ctx.fillText("GAME OVER", W / 2 - 130, H / 2 - 30);
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

    if (G.state.gameOver) return drawGameOver();

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
      if (G.bombCd <= 0 && !G.state.gameOver) {
        triggerBomb();
        G.bombCd = 180;
      }
    }
    if (e.code === "KeyR" && G.state.gameOver) newGame();
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
    const over = G.state.gameOver;
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
    const over = G.state.gameOver;
    if (over !== wasOver) { wasOver = over; updateSubmitUI(); }
    render();
    requestAnimationFrame(frame);
  }

  newGame();
  loadBoard();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
