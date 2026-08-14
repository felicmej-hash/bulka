(() => {
  'use strict';

  const CELL = 40;
  const MAZE = [
    '###############',
    '#...#.......#.#',
    '#.#.#.#####.#.#',
    '#.#.......#...#',
    '#.#####.#.#.###',
    '#.#.#...#.#...#',
    '#.#.#.#.#.###.#',
    '#...#.#...#...#',
    '###.#.#####.#.#',
    '#.......#.....#',
    '###############',
  ];
  const COLS = MAZE[0].length;
  const ROWS = MAZE.length;
  const SPAWNS = [
    { x: 1, y: 1 },
    { x: COLS - 2, y: 1 },
    { x: 1, y: ROWS - 2 },
    { x: COLS - 2, y: ROWS - 2 },
  ];

  function isWall(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return true;
    return MAZE[gy][gx] === '#';
  }

  function randomSpawn() {
    return SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  }

  // ---------- audio ----------
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
  }
  function beep(freqStart, freqEnd, duration, type, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    const t0 = audioCtx.currentTime;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }
  function playShoot() { beep(700, 300, 0.12, 'square', 0.12); }
  function playBump() { beep(150, 80, 0.08, 'sine', 0.1); }
  function playRespawn() { beep(300, 900, 0.3, 'triangle', 0.12); }
  function playHit() {
    if (!audioCtx) return;
    const dur = 0.2;
    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    noise.connect(gain).connect(audioCtx.destination);
    noise.start();
  }

  // ---------- state ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hpEl = document.getElementById('hp');
  const killsEl = document.getElementById('kills');
  const onlineEl = document.getElementById('online');
  const respawnEl = document.getElementById('respawn');
  const overlay = document.getElementById('overlay');
  const nameInput = document.getElementById('nameInput');
  const playBtn = document.getElementById('playBtn');
  const touchControls = document.getElementById('touchControls');

  const DIR_VEC = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let myId = null;
  let me = null; // {gx, gy, px, py, dir, hp, kills, color, name}
  let others = {};
  let othersRender = {}; // smoothed {x,y} per id for rendering between polls
  let bullets = []; // {x,y (grid float), dir, ownerId, ownerColor}
  let moving = false;
  let moveStart = 0;
  let moveFrom = { x: 0, y: 0 };
  let moveTo = { x: 0, y: 0 };
  const MOVE_MS = 130;
  let lastShot = 0;
  const SHOT_COOLDOWN = 350;
  let dead = false;

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function keyDir() {
    if (keys['arrowup'] || keys['w']) return 'up';
    if (keys['arrowdown'] || keys['s']) return 'down';
    if (keys['arrowleft'] || keys['a']) return 'left';
    if (keys['arrowright'] || keys['d']) return 'right';
    return null;
  }

  function bindTouchButton(el, keyName) {
    if (!el) return;
    const setKey = (value) => (e) => {
      e.preventDefault();
      keys[keyName] = value;
    };
    el.addEventListener('touchstart', setKey(true), { passive: false });
    el.addEventListener('touchend', setKey(false), { passive: false });
    el.addEventListener('touchcancel', setKey(false), { passive: false });
    el.addEventListener('mousedown', setKey(true));
    el.addEventListener('mouseup', setKey(false));
    el.addEventListener('mouseleave', setKey(false));
  }

  function setupTouchControls() {
    bindTouchButton(document.querySelector('.tup'), 'arrowup');
    bindTouchButton(document.querySelector('.tdown'), 'arrowdown');
    bindTouchButton(document.querySelector('.tleft'), 'arrowleft');
    bindTouchButton(document.querySelector('.tright'), 'arrowright');
    bindTouchButton(document.getElementById('fireBtn'), ' ');
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      touchControls.classList.remove('hidden');
    }
  }
  setupTouchControls();

  async function api(action, payload) {
    const res = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
    });
    return res.json();
  }

  function applyPlayers(players) {
    others = {};
    let count = 0;
    for (const id in players) {
      count++;
      if (id === myId) continue;
      others[id] = players[id];
    }
    onlineEl.textContent = String(count);
  }

  async function doJoin() {
    initAudio();
    const spawn = randomSpawn();
    const name = nameInput.value.trim();
    const res = await api('join', { name, spawn });
    if (!res.ok) return;
    myId = res.id;
    me = {
      gx: spawn.x, gy: spawn.y,
      px: spawn.x, py: spawn.y,
      dir: 'down', hp: 3, kills: 0,
      color: res.players[myId].color, name: res.players[myId].name,
    };
    applyPlayers(res.players);
    overlay.classList.add('hidden');
    requestAnimationFrame(loop);
    startPolling();
    startKeepAlive();
  }

  playBtn.addEventListener('click', doJoin);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJoin();
  });

  function sendUpdate(extra) {
    if (!myId) return;
    const payload = Object.assign({ id: myId, x: me.gx, y: me.gy, dir: me.dir }, extra || {});
    api('update', payload).then((res) => {
      if (res && res.ok) applyPlayers(res.players);
    });
  }

  function startPolling() {
    setInterval(() => {
      if (!myId) return;
      api('poll', {}).then((res) => {
        if (res && res.ok) applyPlayers(res.players);
      });
    }, 200);
  }

  function startKeepAlive() {
    setInterval(() => {
      if (!myId || dead) return;
      sendUpdate();
    }, 3000);
  }

  function tryMove(dir) {
    if (moving || dead) {
      me.dir = dir;
      return;
    }
    me.dir = dir;
    const v = DIR_VEC[dir];
    const tx = me.gx + v.x;
    const ty = me.gy + v.y;
    if (isWall(tx, ty)) {
      playBump();
      sendUpdate();
      return;
    }
    moving = true;
    moveStart = performance.now();
    moveFrom = { x: me.gx, y: me.gy };
    moveTo = { x: tx, y: ty };
    me.gx = tx;
    me.gy = ty;
    sendUpdate();
  }

  function shoot() {
    const now = performance.now();
    if (now - lastShot < SHOT_COOLDOWN || dead) return;
    lastShot = now;
    const v = DIR_VEC[me.dir];
    bullets.push({
      x: me.px + 0.5 + v.x * 0.5,
      y: me.py + 0.5 + v.y * 0.5,
      dir: me.dir,
      ownerId: myId,
      ownerColor: me.color,
    });
    playShoot();
  }

  function onHitByMe(targetId) {
    sendUpdate({ hitId: targetId });
  }

  function respawnMe() {
    dead = true;
    respawnEl.style.display = 'flex';
    setTimeout(() => {
      const spawn = randomSpawn();
      me.gx = spawn.x; me.gy = spawn.y;
      me.px = spawn.x; me.py = spawn.y;
      me.hp = 3;
      moving = false;
      dead = false;
      respawnEl.style.display = 'none';
      playRespawn();
      sendUpdate({ respawn: true, spawn });
    }, 1800);
  }

  let lastTime = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;

    if (!dead) {
      const d = keyDir();
      if (d) tryMove(d);
      if (keys[' ']) shoot();
    }

    if (moving) {
      const elapsed = t - moveStart;
      const frac = Math.min(1, elapsed / MOVE_MS);
      me.px = moveFrom.x + (moveTo.x - moveFrom.x) * frac;
      me.py = moveFrom.y + (moveTo.y - moveFrom.y) * frac;
      if (frac >= 1) {
        moving = false;
        me.px = moveTo.x;
        me.py = moveTo.y;
      }
    }

    // move bullets
    const speed = 6.5; // cells per second
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const v = DIR_VEC[b.dir];
      b.x += v.x * speed * dt;
      b.y += v.y * speed * dt;
      const gx = Math.floor(b.x);
      const gy = Math.floor(b.y);
      if (isWall(gx, gy)) {
        bullets.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const id in others) {
        const o = others[id];
        if (o.hp <= 0) continue;
        const ox = o.x + 0.5;
        const oy = o.y + 0.5;
        if (Math.hypot(ox - b.x, oy - b.y) < 0.45) {
          hit = true;
          playHit();
          onHitByMe(id);
          break;
        }
      }
      if (hit) {
        bullets.splice(i, 1);
      }
    }

    if (myId && me && me.hp <= 0 && !dead) {
      respawnMe();
    }

    updateRenderPositions(dt);
    draw();
    hpEl.textContent = String(Math.max(0, me.hp));
    killsEl.textContent = String(me.kills);

    requestAnimationFrame(loop);
  }

  function updateRenderPositions(dt) {
    for (const id in others) {
      const target = others[id];
      if (!othersRender[id]) {
        othersRender[id] = { x: target.x, y: target.y };
      }
      const r = othersRender[id];
      const ease = 1 - Math.pow(0.002, dt);
      r.x += (target.x - r.x) * ease;
      r.y += (target.y - r.y) * ease;
    }
    for (const id in othersRender) {
      if (!others[id]) delete othersRender[id];
    }
  }

  function draw() {
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#3a4356';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (MAZE[y][x] === '#') {
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    for (const id in others) {
      const r = othersRender[id] || others[id];
      drawTank(r.x, r.y, others[id].dir, others[id].color, others[id].name, others[id].hp);
    }
    if (!dead && me) {
      drawTank(me.px, me.py, me.dir, me.color, me.name + ' (ты)', me.hp);
    }

    for (const b of bullets) {
      ctx.fillStyle = b.ownerColor || '#fff';
      ctx.beginPath();
      ctx.arc(b.x * CELL, b.y * CELL, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTank(gx, gy, dir, color, name, hp) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    ctx.save();
    ctx.translate(cx, cy);
    const rot = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[dir] || 0;
    ctx.rotate(rot);
    ctx.fillStyle = color || '#e74c3c';
    ctx.fillRect(-12, -10, 24, 20);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-14, -12, 6, 24);
    ctx.fillRect(8, -12, 6, 24);
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#eef2f7';
    ctx.font = '10px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name + ' ' + '❤'.repeat(Math.max(0, hp)), cx, gy * CELL - 4);
  }

  const applyPlayersBase = applyPlayers;
  applyPlayers = function (players) {
    if (myId && players[myId] && me) {
      me.hp = players[myId].hp;
      me.kills = players[myId].kills || 0;
    }
    applyPlayersBase(players);
  };

  window.addEventListener('beforeunload', () => {
    if (myId) {
      navigator.sendBeacon('api.php?action=leave', JSON.stringify({ action: 'leave', id: myId }));
    }
  });
})();
