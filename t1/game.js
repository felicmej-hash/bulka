(() => {
  'use strict';

  const WORLD = 2600;
  const SEG_SPACING = 9;
  const SPEED = 130;
  const TURN_RATE = 4.2;
  const START_LEN = 60;
  const GROW_PER_FOOD = 6;
  const FOOD_COUNT = 220;
  const FOOD_R = 5;
  const HEAD_R = 9;
  const EAT_R = HEAD_R + FOOD_R;
  const KILL_R = HEAD_R + 3;
  const BOT_COUNT = 10;
  const BRAND = '#20d0c4';
  const BOT_COLORS = ['#8892a6', '#6c7686', '#a2adbd', '#7d8798', '#95a0b0'];

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
  function playEat() { beep(500, 800, 0.06, 'sine', 0.08); }
  function playKill() { beep(300, 900, 0.15, 'triangle', 0.1); }
  function playDeath() {
    if (!audioCtx) return;
    const dur = 0.4;
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

  // ---------- dom ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const lengthVal = document.getElementById('lengthVal');
  const leaderboard = document.getElementById('leaderboard');
  const lbList = document.getElementById('lbList');
  const respawnEl = document.getElementById('respawn');
  const overlay = document.getElementById('overlay');
  const nameInput = document.getElementById('nameInput');
  const playBtn = document.getElementById('playBtn');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function rand(min, max) { return min + Math.random() * (max - min); }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---------- food ----------
  let food = [];
  function spawnFood(n) {
    for (let i = 0; i < n; i++) {
      food.push({
        x: rand(30, WORLD - 30),
        y: rand(30, WORLD - 30),
        r: FOOD_R,
        color: Math.random() < 0.5 ? BRAND : '#ffffff',
      });
    }
  }
  spawnFood(FOOD_COUNT);

  function burstFood(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(5, 40);
      food.push({
        x: Math.min(WORLD - 10, Math.max(10, x + Math.cos(a) * r)),
        y: Math.min(WORLD - 10, Math.max(10, y + Math.sin(a) * r)),
        r: FOOD_R,
        color: Math.random() < 0.5 ? BRAND : '#ffffff',
      });
    }
  }

  // ---------- snake helpers ----------
  function makeSnake(x, y, color, name, isBot) {
    return {
      x, y, angle: rand(0, Math.PI * 2), targetAngle: 0,
      length: START_LEN, color, name, isBot: !!isBot,
      path: [{ x, y }],
    };
  }

  function stepSnake(s, dt, desiredAngle) {
    if (desiredAngle !== null && desiredAngle !== undefined) {
      const diff = angleDiff(s.angle, desiredAngle);
      const maxTurn = TURN_RATE * dt;
      s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    s.x += Math.cos(s.angle) * SPEED * dt;
    s.y += Math.sin(s.angle) * SPEED * dt;
    s.path.push({ x: s.x, y: s.y });
    const maxPoints = (Math.ceil(s.length / SEG_SPACING) + 4) * 4;
    if (s.path.length > maxPoints) {
      s.path.splice(0, s.path.length - maxPoints);
    }
  }

  function segmentsOf(s) {
    const segs = [];
    const count = Math.max(4, Math.floor(s.length / SEG_SPACING));
    let acc = 0;
    let prev = s.path[s.path.length - 1];
    segs.push({ x: prev.x, y: prev.y });
    for (let i = s.path.length - 2; i >= 0 && segs.length < count; i--) {
      const p = s.path[i];
      acc += dist(prev.x, prev.y, p.x, p.y);
      if (acc >= SEG_SPACING) {
        segs.push({ x: p.x, y: p.y });
        acc = 0;
      }
      prev = p;
    }
    return segs;
  }

  // ---------- bots (simulated locally, not networked) ----------
  let bots = [];
  function spawnBot() {
    const x = rand(100, WORLD - 100);
    const y = rand(100, WORLD - 100);
    const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    const b = makeSnake(x, y, color, 'Бот', true);
    b.turnTimer = rand(0.5, 2);
    return b;
  }
  for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnBot());

  function updateBot(b, dt) {
    b.turnTimer -= dt;
    if (b.turnTimer <= 0) {
      b.targetAngle = b.angle + rand(-1.2, 1.2);
      b.turnTimer = rand(1, 2.5);
    }
    const margin = 120;
    if (b.x < margin) b.targetAngle = 0;
    else if (b.x > WORLD - margin) b.targetAngle = Math.PI;
    else if (b.y < margin) b.targetAngle = Math.PI / 2;
    else if (b.y > WORLD - margin) b.targetAngle = -Math.PI / 2;
    stepSnake(b, dt, b.targetAngle);
    if (b.length < 400) b.length += dt * 0.6;
  }

  function killBot(b) {
    burstFood(b.x, b.y, Math.min(20, Math.floor(b.length / 6)));
    const x = rand(100, WORLD - 100);
    const y = rand(100, WORLD - 100);
    b.x = x; b.y = y; b.length = START_LEN; b.path = [{ x, y }]; b.angle = rand(0, Math.PI * 2);
  }

  // ---------- player ----------
  let myId = null;
  let me = null;
  let dead = false;
  const pointer = { x: 0, y: 0, active: false };

  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  });

  // ---------- networking ----------
  let others = {};
  let othersPath = {};

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
    for (const id in players) {
      if (id === myId) continue;
      others[id] = players[id];
      if (!othersPath[id]) {
        othersPath[id] = [{ x: players[id].x, y: players[id].y }];
      }
    }
    for (const id in othersPath) {
      if (!others[id]) delete othersPath[id];
    }
  }

  function updateLeaderboard() {
    const list = [];
    if (me) list.push({ name: me.name + ' (ты)', length: me.length, mine: true });
    for (const id in others) list.push({ name: others[id].name, length: others[id].length || START_LEN, mine: false });
    for (const b of bots) list.push({ name: b.name, length: b.length, mine: false });
    list.sort((a, b) => b.length - a.length);
    lbList.innerHTML = list.slice(0, 8).map((p) =>
      '<li class="' + (p.mine ? 'me' : '') + '">' + p.name + ' — ' + Math.round(p.length) + '</li>'
    ).join('');
  }

  async function doJoin() {
    initAudio();
    const name = nameInput.value.trim();
    const x = rand(200, WORLD - 200);
    const y = rand(200, WORLD - 200);
    const res = await api('join', { name, x, y });
    if (!res.ok) return;
    myId = res.id;
    me = makeSnake(x, y, BRAND, res.players[myId].name, false);
    applyPlayers(res.players);
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    leaderboard.classList.remove('hidden');
    requestAnimationFrame(loop);
    startPolling();
    startKeepAlive();
  }

  playBtn.addEventListener('click', doJoin);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJoin();
  });

  function sendUpdate(extra) {
    if (!myId || !me) return;
    const payload = Object.assign(
      { id: myId, x: me.x, y: me.y, angle: me.angle, length: me.length },
      extra || {}
    );
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
    }, 1500);
  }

  function killMe(byId) {
    dead = true;
    playDeath();
    burstFood(me.x, me.y, Math.min(30, Math.floor(me.length / 6)));
    respawnEl.style.display = 'flex';
    const extra = { died: true };
    if (byId) extra.killedBy = byId;
    setTimeout(() => {
      const x = rand(200, WORLD - 200);
      const y = rand(200, WORLD - 200);
      me.x = x; me.y = y; me.length = START_LEN; me.path = [{ x, y }];
      extra.spawnX = x; extra.spawnY = y;
      dead = false;
      respawnEl.style.display = 'none';
      sendUpdate(extra);
    }, 1600);
  }

  // ---------- main loop ----------
  let lastTime = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;

    if (!dead && me) {
      const desired = pointer.active
        ? Math.atan2(pointer.y - canvas.height / 2, pointer.x - canvas.width / 2)
        : null;
      stepSnake(me, dt, desired);
      me.x = Math.max(4, Math.min(WORLD - 4, me.x));
      me.y = Math.max(4, Math.min(WORLD - 4, me.y));

      for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (dist(me.x, me.y, f.x, f.y) < EAT_R) {
          food.splice(i, 1);
          me.length += GROW_PER_FOOD;
          playEat();
          spawnFood(1);
        }
      }

      if (me.x <= 5 || me.x >= WORLD - 5 || me.y <= 5 || me.y >= WORLD - 5) {
        killMe(null);
      }

      if (!dead) {
        for (const b of bots) {
          const segs = segmentsOf(b);
          for (let i = 3; i < segs.length; i++) {
            if (dist(me.x, me.y, segs[i].x, segs[i].y) < KILL_R) {
              killBot(b);
              me.length += 20;
              playKill();
              break;
            }
          }
        }
      }

      if (!dead) {
        for (const id in others) {
          const trail = othersPath[id];
          if (!trail) continue;
          let hit = false;
          for (let i = 0; i < trail.length; i += 2) {
            if (dist(me.x, me.y, trail[i].x, trail[i].y) < KILL_R) {
              hit = true;
              break;
            }
          }
          if (hit) {
            killMe(id);
            break;
          }
        }
      }

      sendUpdate();
    }

    for (const b of bots) updateBot(b, dt);

    for (const id in others) {
      const o = others[id];
      const trail = othersPath[id];
      const last = trail[trail.length - 1];
      const ease = 1 - Math.pow(0.002, dt);
      const nx = last.x + (o.x - last.x) * ease;
      const ny = last.y + (o.y - last.y) * ease;
      trail.push({ x: nx, y: ny });
      const maxLen = Math.ceil((o.length || START_LEN) / SEG_SPACING) * 3 + 10;
      if (trail.length > maxLen) trail.splice(0, trail.length - maxLen);
    }

    draw();
    if (me) lengthVal.textContent = String(Math.round(me.length));
    updateLeaderboard();

    requestAnimationFrame(loop);
  }

  function drawSnakeSegs(segs, color, thickness, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < segs.length; i++) {
      const p = segs[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(segs[0].x, segs[0].y, thickness / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = '11px Segoe UI, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, segs[0].x, segs[0].y - 16);
    }
  }

  function otherSegments(id) {
    const trail = othersPath[id];
    const o = others[id];
    const segs = [];
    let acc = 0;
    let prev = trail[trail.length - 1];
    segs.push({ x: prev.x, y: prev.y });
    const count = Math.max(4, Math.floor((o.length || START_LEN) / SEG_SPACING));
    for (let i = trail.length - 2; i >= 0 && segs.length < count; i--) {
      const p = trail[i];
      acc += dist(prev.x, prev.y, p.x, p.y);
      if (acc >= SEG_SPACING) {
        segs.push({ x: p.x, y: p.y });
        acc = 0;
      }
      prev = p;
    }
    return segs;
  }

  function draw() {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!me) return;

    ctx.save();
    ctx.translate(canvas.width / 2 - me.x, canvas.height / 2 - me.y);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gs = 60;
    for (let x = 0; x <= WORLD; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD); ctx.stroke();
    }
    for (let y = 0; y <= WORLD; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD, y); ctx.stroke();
    }

    ctx.strokeStyle = '#ff5b5b';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, WORLD, WORLD);

    for (const f of food) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const b of bots) {
      drawSnakeSegs(segmentsOf(b), b.color, HEAD_R * 1.6, null);
    }

    for (const id in others) {
      drawSnakeSegs(otherSegments(id), BRAND, HEAD_R * 1.6, others[id].name);
    }

    if (!dead) {
      drawSnakeSegs(segmentsOf(me), BRAND, HEAD_R * 1.8, null);
    }

    ctx.restore();
  }

  window.addEventListener('beforeunload', () => {
    if (myId) {
      navigator.sendBeacon('api.php?action=leave', JSON.stringify({ action: 'leave', id: myId }));
    }
  });
})();
