// Hexalia UI + online sync (claude.ai db capability or the Vercel /api/game server) or same-device play.
(() => {
  const E = Engine, RES = E.RES, B = Board;
  const $app = document.getElementById('app');

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hexalia:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hexalia:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Session state ----------
  let db = null, user = null, myId = null, netChecked = false;
  let session = null; // {kind:'local'|'online', code, state}
  let unsubGame = null;
  let openGames = [], myGames = [];
  let busy = false;
  const shuffleIcon = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3.5c2 0 3.2.9 4.3 2.6l2.4 4.8c1.1 1.7 2.3 2.6 4.3 2.6H21M3 17h3.5c1.5 0 2.5-.5 3.4-1.5M14.1 8.5c.9-1 1.9-1.5 3.4-1.5H21M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let demo = E.newGame('demo', 'Demo');
  const shuffleMap = () => { demo = { ...demo, board: E.generateBoard() }; render(); };
  const ui = {
    mode: null, // 'road' | 'settle' | 'city'
    name: store.get('name', ''),
    joinCode: '',
    localNames: store.get('localNames', ['Ana', 'Beto', 'Carla']),
    discard: {}, give: {}, get: {},
    tab: 'trade', tradeTab: 'bank', bankGive: 'wood', bankGet: 'brick',
    pick: null, plenty: [],
    toast: '', toastT: 0, lastDiceKey: '', closedOver: '',
  };
  let shown = { screen: null, boardKey: null };
  const map = { full: false, min: false, z: 1, cx: 0, cy: 0 };
  const VB = { x: -300, y: -282, w: 600, h: 564 };
  const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
  const canPanZoom = () => map.full || !isPhone();

  function clampView() {
    map.z = Math.min(4, Math.max(1, map.z));
    const w = VB.w / map.z, h = VB.h / map.z;
    const mx = (VB.w - w) / 2, my = (VB.h - h) / 2;
    map.cx = Math.min(mx, Math.max(-mx, map.cx));
    map.cy = Math.min(my, Math.max(-my, map.cy));
  }
  function applyView() {
    const svg = document.getElementById('board');
    const bw = document.getElementById('bw');
    if (!svg || !bw) return;
    clampView();
    const w = VB.w / map.z, h = VB.h / map.z;
    svg.setAttribute('viewBox', `${(VB.x + VB.w / 2 + map.cx - w / 2).toFixed(1)} ${(VB.y + VB.h / 2 + map.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    bw.classList.toggle('full', map.full);
    bw.classList.toggle('min', map.min && !map.full);
    bw.classList.toggle('pz', canPanZoom());
    document.body.classList.toggle('map-open', map.full);
  }
  function setZoom(z) { map.z = z; applyView(); }
  function openFull() { map.full = true; map.min = false; render(); }
  function closeFull() { map.full = false; map.z = 1; map.cx = 0; map.cy = 0; render(); }

  function attachPanZoom(bw) {
    const pts = new Map();
    let start = null, pinch = null, moved = false;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const unitsPerPx = () => {
      const r = document.getElementById('board').getBoundingClientRect();
      return Math.max(VB.w / map.z / r.width, VB.h / map.z / r.height);
    };
    bw.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; start = { x: e.clientX, y: e.clientY, cx: map.cx, cy: map.cy }; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: dist(a, b) || 1, z: map.z }; }
    });
    bw.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) moved = true;
      if (!canPanZoom()) return;
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        setZoom(pinch.z * dist(a, b) / pinch.d);
      } else if (pts.size === 1 && moved) {
        const k = unitsPerPx();
        map.cx = start.cx - (e.clientX - start.x) * k;
        map.cy = start.cy - (e.clientY - start.y) * k;
        applyView();
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const p = [...pts.values()][0]; start = { x: p.x, y: p.y, cx: map.cx, cy: map.cy }; }
      if (!pts.size) start = null;
    };
    bw.addEventListener('pointerup', end);
    bw.addEventListener('pointercancel', end);
    bw.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); return; }
      if (!map.full && isPhone()) { e.stopPropagation(); e.preventDefault(); openFull(); }
    }, true);
    bw.addEventListener('wheel', (e) => {
      if (!canPanZoom()) return;
      e.preventDefault();
      setZoom(map.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    }, { passive: false });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && map.full) closeFull(); });
  window.addEventListener('resize', () => applyView());

  function toast(msg) {
    ui.toast = msg;
    clearTimeout(ui.toastT);
    ui.toastT = setTimeout(() => { ui.toast = ''; render(); }, 3400);
    render();
  }

  function viewerIdx(s) {
    if (!s || !session) return -1;
    if (session.kind === 'online') return s.players.findIndex((p) => p.id === myId);
    if (s.phase === 'order') { const i = s.order.contenders.find((c) => s.order.rolls[c] === undefined); return i === undefined ? 0 : i; }
    if (s.phase === 'main' && s.turn.step === 'discard' && s.discards) return Number(Object.keys(s.discards)[0]);
    return s.turn ? s.turn.cur : 0;
  }
  const pColor = (p) => E.PLAYER_COLORS[p.color].hex;

  // ---------- Online backends: claude.ai db, or the Vercel API (/api/game) ----------
  let net = null; // { kind, create(state), get(code), act(code, action), watch(code, cb), lists(cb) }
  const recent = () => store.get('recent', []);
  const remember = (code) => store.set('recent', [code, ...recent().filter((c) => c !== code)].slice(0, 8));

  function randomCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  }

  function claudeNet() {
    const docFor = (code, state) => ({ state, phase: state.phase, code, names: state.players.map((p) => p.name), pids: state.players.map((p) => p.id), updatedAt: Date.now() });
    const denied = (e) => e && e.code === 'invalid_argument';
    return {
      kind: 'claude',
      async create(state) {
        let code;
        for (let i = 0; i < 5; i++) {
          code = randomCode();
          if (!(await db.doc('games/' + code).get()).exists) break;
        }
        try { await db.doc('games/' + code).set(docFor(code, state)); } catch (e) { throw new Error(denied(e) ? 'No tienes permiso para crear partidas aquí. Pide al dueño que te invite como editor.' : 'No se pudo crear la partida.'); }
        return code;
      },
      async get(code) {
        const snap = await db.doc('games/' + code).get();
        return snap.exists ? snap.data().state : null;
      },
      async act(code, action) {
        const ref = db.doc('games/' + code);
        try {
          for (let i = 0; i < 24; i++) {
            let lease;
            try { lease = await ref.acquire({ holder: myId, ttlMs: 1500 }); } catch (e) { lease = { acquired: false }; }
            if (lease.acquired) {
              const snap = await ref.get();
              if (!snap.exists) return { ok: false, error: 'La partida ya no existe.' };
              const r = E.apply(snap.data().state, action, myId);
              if (r.ok) await ref.set(docFor(code, r.state));
              return r;
            }
            await sleep(200 + Math.random() * 300);
          }
          return { ok: false, error: 'No se pudo guardar la jugada. Inténtalo otra vez.' };
        } catch (e) {
          return { ok: false, error: denied(e) ? 'No tienes permiso para jugar en esta página. Pide al dueño que te invite como editor.' : 'Error de conexión. Inténtalo otra vez.' };
        }
      },
      watch(code, cb) {
        return db.doc('games/' + code).onSnapshot((snap) => cb(snap.exists ? snap.data().state : null), () => toast('Se perdió la conexión con la partida. Recarga la página.'));
      },
      lists(cb) {
        let open = [], mine = [];
        db.collection('games').where('phase', '==', 'lobby').onSnapshot((snap) => { open = snap.docs.map((d) => d.data()); cb(open, mine); }, () => {});
        db.collection('games').where('pids', 'array-contains', myId).onSnapshot((snap) => { mine = snap.docs.map((d) => d.data()); cb(open, mine); }, () => {});
      },
    };
  }

  function apiNet() {
    const versions = {};
    const read = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok && r.status !== 404) throw new Error(j.error || 'Error del servidor. Inténtalo otra vez.'); return j; };
    const post = async (body) => read(await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return {
      kind: 'api',
      async create(state) {
        const j = await post({ op: 'create', state });
        versions[j.code] = j.v;
        remember(j.code);
        return j.code;
      },
      async get(code) {
        const r = await fetch('/api/game?code=' + encodeURIComponent(code));
        if (r.status === 404) return null;
        const j = await read(r);
        versions[code] = j.v;
        remember(code);
        return j.state;
      },
      async act(code, action) {
        try {
          const j = await post({ op: 'act', code, action, pid: myId });
          if (j.ok) versions[code] = j.v;
          return j;
        } catch (e) { return { ok: false, error: e.message }; }
      },
      watch(code, cb) {
        let stop = false;
        const tick = async () => {
          if (stop) return;
          try {
            const r = await fetch(`/api/game?code=${encodeURIComponent(code)}&v=${versions[code] ?? -1}`);
            if (r.status === 404) cb(null);
            else {
              const j = await r.json();
              if (!stop && j.state && j.v !== versions[code]) { versions[code] = j.v; cb(j.state); }
            }
          } catch { /* retry on next tick */ }
          if (!stop) setTimeout(tick, document.hidden ? 4000 : 1200);
        };
        setTimeout(tick, 1200);
        return () => { stop = true; };
      },
      lists(cb) {
        const tick = async () => {
          if (!session) {
            try {
              const j = await (await fetch('/api/game?op=list&codes=' + encodeURIComponent(recent().join(',')))).json();
              cb(j.open || [], j.mine || []);
            } catch { /* listing is optional */ }
          }
          setTimeout(tick, 6000);
        };
        tick();
      },
    };
  }

  // ---------- Commit an action ----------
  async function commit(action) {
    if (busy) return;
    const s = session.state;
    if (session.kind === 'local') {
      const actor = action.as !== undefined ? s.players[action.as].id : s.players[viewerIdx(s)].id;
      const r = E.apply(s, action, actor);
      if (!r.ok) return toast(r.error);
      session.state = r.state;
      store.set('localGame', r.state);
      afterChange(action);
      return render();
    }
    busy = true; render();
    const r = await net.act(session.code, action);
    if (!r.ok) toast(r.error);
    else { session.state = r.state; afterChange(action); }
    busy = false; render();
  }

  function afterChange(action) {
    if (['road', 'settle', 'city'].includes(action.type)) ui.mode = null;
    if (action.type === 'discard') ui.discard = {};
    if (action.type === 'offer' || action.type === 'acceptOffer') { ui.give = {}; ui.get = {}; }
    if (action.type === 'playDev') { ui.pick = null; ui.plenty = []; }
  }

  // ---------- Online games ----------
  async function createOnline() {
    const name = ui.name.trim();
    if (!name) return toast('Escribe tu nombre primero.');
    store.set('name', name);
    busy = true; render();
    try {
      const state = E.newGame(myId, name);
      state.board = JSON.parse(JSON.stringify(demo.board));
      const code = await net.create(state);
      session = { kind: 'online', code, state };
      watchGame(code);
    } catch (e) {
      session = null;
      toast(e.message || 'No se pudo crear la partida.');
    }
    busy = false; render();
  }

  async function joinOnline(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return toast('Escribe el código de la partida.');
    const name = ui.name.trim();
    busy = true; render();
    try {
      const st = await net.get(code);
      if (!st) { busy = false; render(); return toast('No existe una partida con ese código.'); }
      session = { kind: 'online', code, state: st };
      watchGame(code);
      busy = false;
      if (!st.players.some((p) => p.id === myId) && st.phase === 'lobby') {
        if (!name) toast('Escribe tu nombre y pulsa Unirme.');
        else { store.set('name', name); await commit({ type: 'join', name }); }
      }
    } catch (e) {
      busy = false;
      toast(e.message || 'No se pudo abrir la partida.');
    }
    render();
  }

  function watchGame(code) {
    if (unsubGame) unsubGame();
    unsubGame = net.watch(code, (st) => {
      if (!session || session.code !== code) return;
      if (!st) { toast('La partida fue borrada.'); return; }
      session.state = st;
      render();
    });
  }

  function leaveSession() {
    if (unsubGame) { unsubGame(); unsubGame = null; }
    session = null;
    ui.mode = null; ui.pick = null;
    render();
  }

  (async () => {
    try {
      if (window.claude && window.claude.use) [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (user) myId = await user.id();
    } catch { db = null; }
    if (!myId) {
      myId = store.get('pid', null);
      if (!myId) { myId = 'p' + Math.random().toString(36).slice(2, 10); store.set('pid', myId); }
    }
    if (db) net = claudeNet();
    else if (/^https?:$/.test(location.protocol)) {
      try { if ((await fetch('/api/game?op=ping')).ok) net = apiNet(); } catch { /* no server: same-device only */ }
    }
    netChecked = true;
    if (net) {
      net.lists((open, mine) => {
        openGames = open.filter((g) => g.phase === 'lobby').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
        myGames = mine.filter((g) => g.phase !== 'ended' && (g.pids || []).includes(myId)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
        if (!session) render();
      });
      const code = (location.hash || '').replace('#', '');
      if (/^[A-Z0-9]{5}$/.test(code)) joinOnline(code);
    }
    render();
  })();

  // ---------- Small pieces ----------
  const dieFaces = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const die = (n, anim) => `<div class="die${anim ? ' roll' : ''}" aria-label="${n}">${Array.from({ length: 9 }, (_, i) => (dieFaces[n].includes(i + 1) ? '<i></i>' : '<span></span>')).join('')}</div>`;
  const ci = (r) => `<span class="ci r-${r}" title="${E.RES_NAME[r]}">${B.resIcon(r, 13)}</span>`;
  const costIcons = (cost) => `<span class="bcost">${RES.flatMap((r) => Array(cost[r] || 0).fill(ci(r))).join('')}</span>`;
  const miniRes = (res) => RES.filter((r) => res[r]).map((r) => `<span class="mini r-${r}">${B.resIcon(r, 16)}${res[r]}</span>`).join(' ') || '<span class="note">nada</span>';
  const avatar = (p, size = 34) => `<span class="avatar" style="background:${pColor(p)};width:${size}px;height:${size}px">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const pieceIcon = (kind) => {
    const c = '#ffb25c';
    if (kind === 'road') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true"><line x1="-12" y1="10" x2="12" y2="-10" stroke="#0b1418" stroke-width="9" stroke-linecap="round"/><line x1="-12" y1="10" x2="12" y2="-10" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>`;
    if (kind === 'settle') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true">${B.settlementShape(0, 2, c)}</svg>`;
    if (kind === 'city') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true">${B.cityShape(0, 2, c)}</svg>`;
    return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true"><g transform="rotate(-8)"><rect x="-10" y="-14" width="20" height="28" rx="3" fill="#f6efe0" stroke="#0b1418" stroke-width="1.6"/><rect x="-7" y="-10" width="14" height="20" rx="2" fill="none" stroke="#c38a3c" stroke-width="1.4"/><path d="M0 -5l2 4 4 .5-3 3 .8 4.2L0 4.6-3.8 6.7-3 2.5l-3-3 4-.5z" fill="#c38a3c"/></g></svg>`;
  };


  // ---------- Targets + hint ----------
  function targets(s, vi) {
    const t = { hexes: [], edges: [], verts: [], cities: [] };
    if (!session || vi < 0 || busy) return t;
    if (s.phase === 'setup') {
      if (s.turn.cur !== vi) return t;
      if (s.turn.step === 'settle') t.verts = E.settlementSpots(s, vi, true);
      else t.edges = E.roadSpots(s, vi);
      return t;
    }
    if (s.phase !== 'main' || s.turn.cur !== vi) return t;
    const st = s.turn.step;
    if (st === 'robber') t.hexes = [...Array(19).keys()].filter((h) => h !== s.board.robber);
    else if (st === 'roadBuilding') t.edges = E.roadSpots(s, vi);
    else if (st === 'main') {
      if (ui.mode === 'road') t.edges = E.roadSpots(s, vi);
      if (ui.mode === 'settle') t.verts = E.settlementSpots(s, vi, false);
      if (ui.mode === 'city') t.cities = E.citySpots(s, vi);
    }
    return t;
  }

  function hintText(s, vi, t) {
    if (!session) return '';
    if (s.phase === 'lobby') return 'Vista previa del mapa';
    if (s.phase === 'order') return 'Tiren los dados para ver quién empieza';
    if (t.verts.length) return 'Toca un punto brillante para fundar tu poblado';
    if (t.edges.length) return 'Toca un tramo brillante para construir el camino';
    if (t.hexes.length) return 'Toca una casilla para mover al bandido';
    if (t.cities.length) return 'Toca uno de tus poblados para convertirlo en ciudad';
    if (s.phase === 'ended') return `${s.players[s.winner].name} ganó la partida`;
    if (s.turn && vi !== s.turn.cur && session.kind === 'online') return `Turno de ${s.players[s.turn.cur].name}`;
    return '';
  }

  // ---------- Instruction for the turn card ----------
  function instruction(s, vi) {
    const cur = s.players[s.turn.cur];
    const mine = vi === s.turn.cur;
    if (s.phase === 'setup') {
      const second = s.setup.i >= s.players.length;
      if (!mine) return { mine, text: `${cur.name} coloca su ${second ? 'segundo' : 'primer'} poblado`, sub: 'Colocación inicial: en orden y luego de vuelta.' };
      return s.turn.step === 'settle'
        ? { mine, text: `Coloca tu ${second ? 'segundo' : 'primer'} poblado`, sub: second ? 'Recibirás un recurso de cada casilla que toque.' : 'Elige un cruce junto a buenos números: el 6 y el 8 salen más.' }
        : { mine, text: 'Ahora coloca un camino', sub: 'Debe salir del poblado que acabas de poner.' };
    }
    if (s.phase === 'ended') return { mine: false, text: `${s.players[s.winner].name} ganó`, sub: '' };
    const st = s.turn.step;
    if (st === 'discard') {
      if (vi >= 0 && s.discards[vi] !== undefined) return { mine: true, text: `Descarta ${s.discards[vi]} cartas`, sub: 'Salió un 7 y tienes más de 7 cartas.', who: s.players[vi] };
      return { mine: false, text: 'Esperando descartes', sub: Object.keys(s.discards).map((i) => s.players[i].name).join(', ') + ' deben descartar la mitad.' };
    }
    if (!mine) {
      const what = { roll: 'va a tirar los dados', main: 'está comerciando y construyendo', robber: 'mueve al bandido', steal: 'elige a quién robar', roadBuilding: 'construye caminos gratis' }[st];
      return { mine, text: `${cur.name} ${what}`, sub: '' };
    }
    switch (st) {
      case 'roll': return { mine, text: 'Tira los dados', sub: 'Si quieres, antes puedes jugar un Guardián.' };
      case 'robber': return { mine, text: 'Mueve al bandido', sub: 'Toca una casilla en el mapa. Bloquea su producción y robas 1 carta a un vecino.' };
      case 'steal': return { mine, text: '¿A quién le robas?', sub: 'Se toma una carta al azar.' };
      case 'roadBuilding': return { mine, text: `Coloca ${s.turn.freeRoads} camino${s.turn.freeRoads > 1 ? 's' : ''} gratis`, sub: 'Toca un tramo brillante en el mapa.' };
      default: {
        const m = { road: 'Toca un tramo brillante en el mapa.', settle: 'Toca un punto brillante en el mapa.', city: 'Toca uno de tus poblados en el mapa.' }[ui.mode];
        return { mine, text: ui.mode ? { road: 'Construye un camino', settle: 'Funda un poblado', city: 'Mejora a ciudad' }[ui.mode] : 'Comercia y construye', sub: m || 'Usa tus cartas de abajo. Cuando termines, pasa el turno.' };
      }
    }
  }

  // ---------- Render ----------
  function screenOf() {
    if (!session) return 'home';
    return session.state.phase === 'lobby' ? 'lobby' : 'game';
  }

  function render() {
    const screen = screenOf();
    if (shown.screen !== screen) {
      $app.innerHTML = `<header class="topbar" id="top"></header>
        <main class="split">
          <div class="board-wrap" id="bw"><svg id="board" viewBox="${B.VIEWBOX}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de la isla">${B.defs()}<g id="bs"></g><g id="bl"></g></svg><div class="hint" id="hint" hidden></div><div class="mapbtn" id="mapbtn"></div><div class="mapctl" id="mapctl"></div><div class="legend" id="legend"></div><div class="fullbar" id="fullbar"></div></div>
          <aside class="side" id="side"></aside>
        </main><div id="over"></div><div id="toast"></div>`;
      shown = { screen, boardKey: null };
      attachPanZoom(document.getElementById('bw'));
    }
    const s = session ? session.state : demo;
    const vi = viewerIdx(s);

    document.getElementById('top').innerHTML = topbar();
    const key = JSON.stringify([s.board.hexes, s.board.ports]);
    if (shown.boardKey !== key) {
      document.getElementById('bs').innerHTML = B.staticLayer(s);
      document.getElementById('legend').innerHTML = [['forest', 'wood'], ['hills', 'brick'], ['pasture', 'sheep'], ['fields', 'wheat'], ['mountains', 'ore']].map(([t, r]) => `<span><i class="r-${r}"></i>${E.TERRAIN_NAME[t]} → ${E.RES_NAME[r]}</span>`).join('');
      shown.boardKey = key;
    }
    const t = targets(s, vi);
    document.getElementById('bl').innerHTML = B.liveLayer(s, t, (i) => pColor(s.players[i]));
    const canShuffle = screen === 'home' || (screen === 'lobby' && s.hostId === myId);
    document.getElementById('mapbtn').innerHTML = canShuffle ? `<button class="btn" data-act="${screen === 'home' ? 'shuffle' : 'reroll'}" ${busy ? 'disabled' : ''}>${shuffleIcon} Mezclar mapa</button>` : '';
    const I = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const zoomBtns = `<button class="btn icon" data-act="zoomOut" aria-label="Alejar">${I('M5 12h14')}</button><button class="btn icon" data-act="zoomIn" aria-label="Acercar">${I('M12 5v14M5 12h14')}</button><button class="btn icon" data-act="zoomReset" aria-label="Ver todo el mapa">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}</button>`;
    let ctl = '';
    if (map.full) ctl = `${zoomBtns}<button class="btn primary" data-act="closeMap">${I('M6 6l12 12M18 6L6 18')} Cerrar mapa</button>`;
    else if (isPhone()) ctl = `<button class="btn" data-act="openMap">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')} Ampliar</button><button class="btn" data-act="toggleMin">${map.min ? I('M6 15l6-6 6 6') + ' Ver mapa' : I('M6 9l6 6 6-6') + ' Minimizar'}</button>`;
    else ctl = `${zoomBtns}<button class="btn" data-act="openMap">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')} Pantalla completa</button>`;
    document.getElementById('mapctl').innerHTML = ctl;
    document.getElementById('fullbar').innerHTML = map.full && session && screen === 'game' ? fullBar(s, vi) : '';
    applyView();
    const hint = document.getElementById('hint');
    let ht = hintText(s, vi, t);
    if (ht && !map.full && isPhone() && (t.verts.length || t.edges.length || t.hexes.length || t.cities.length)) ht += ' · toca el mapa para ampliarlo';
    hint.hidden = !ht;
    hint.textContent = ht;

    const side = document.getElementById('side');
    const focus = document.activeElement && document.activeElement.id;
    const selStart = focus && document.activeElement.selectionStart;
    const scroll = side.scrollTop;
    side.innerHTML = screen === 'home' ? homeSide() : screen === 'lobby' ? lobbySide(s) : gameSide(s, vi);
    side.scrollTop = scroll;
    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus({ preventScroll: true }); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch { /* not a text field */ } }
    }
    const lg = document.getElementById('log');
    if (lg) lg.scrollTop = lg.scrollHeight;

    document.getElementById('over').innerHTML = screen === 'game' ? winOverlay(s) : '';
    document.getElementById('toast').innerHTML = ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '';
  }

  function topbar() {
    const code = session && session.kind === 'online' ? `<span class="chip">Mesa <strong>${esc(session.code)}</strong></span>` : '';
    const local = session && session.kind === 'local' ? `<span class="chip">Mismo dispositivo</span>` : '';
    const sync = busy ? `<span class="chip">Guardando…</span>` : '';
    const exit = session ? `<button class="btn small ghost" data-act="exit">Salir</button>` : '';
    return `<button class="brand" data-act="${session ? 'exit' : 'noop'}" aria-label="Hexalia, inicio">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5" fill="var(--accent)"/><path d="M9 21h14v-6l-7-6-7 6z" fill="#0a1d29"/></svg>
        <h1>Hexalia</h1></button><span class="spacer"></span>${code}${local}${sync}${exit}`;
  }

  function rulesList() {
    return `<ul class="rules">
      <li><b>Gana</b> quien llegue a <b>10 puntos</b> en su turno. Poblado 1 · Ciudad 2 · Camino más largo 2 · Guardia mayor 2 · Monumento 1.</li>
      <li><b>Inicio:</b> cada uno pone un poblado y un camino; luego, en orden inverso, otro poblado y camino. El segundo poblado da un recurso de cada casilla vecina.</li>
      <li><b>Distancia:</b> entre dos poblados siempre queda al menos un cruce libre. Luego, cada poblado nuevo debe tocar uno de tus caminos.</li>
      <li><b>Producción:</b> al tirar, las casillas con ese número dan 1 carta a cada poblado y 2 a cada ciudad que las toquen.</li>
      <li><b>El 7:</b> nadie produce. Si tienes más de 7 cartas, descartas la mitad. Quien tiró mueve al bandido y roba 1 carta a un vecino de esa casilla.</li>
      <li><b>Costos:</b> camino = Madera + Arcilla · poblado = Madera + Arcilla + Lana + Trigo · ciudad = 2 Trigo + 3 Mineral · carta = Lana + Trigo + Mineral.</li>
      <li><b>Comercio:</b> en tu turno, con otros jugadores o con el banco a 4:1. Los puertos mejoran la tasa a 3:1 o 2:1.</li>
      <li><b>Cartas:</b> 14 Guardianes, 5 Monumentos, 2 Constructores, 2 Cosechas, 2 Monopolios. Una por turno y no el mismo turno que la compras.</li>
      <li><b>Camino más largo:</b> 5 tramos seguidos o más. <b>Guardia mayor:</b> 3 Guardianes o más. Si alguien te supera, te lo quita.</li>
    </ul>`;
  }

  // ---------- Home ----------
  function homeSide() {
    const online = !!net;
    const gameRow = (g, label) => `<div class="li"><span class="code">${esc(g.code)}</span><span class="grow">${esc((g.names || []).join(', '))}</span><button class="btn small" data-act="join" data-code="${esc(g.code)}">${label}</button></div>`;
    return `
      <section class="card hero"><h2>Funda poblados, comercia y llega a 10 puntos.</h2><p>Juego de colonización por turnos para 2 a 4 jugadores, cada uno desde su propio teléfono o computadora. Crea una mesa y pasa el código a tus amigos. El mapa es con el que vas a jugar: pulsa «Mezclar mapa» para cambiar de lugar los terrenos, los números y los puertos.</p></section>
      ${online ? `
      <section class="card">
        <div class="label">Tu nombre</div>
        <input type="text" id="name" maxlength="18" placeholder="Escribe tu nombre" value="${esc(ui.name)}" autocomplete="nickname">
        <button class="btn primary big" data-act="create" ${busy ? 'disabled' : ''}>Crear mesa en línea</button>
        <div class="label">¿Te pasaron un código?</div>
        <div class="row"><input type="text" id="joinCode" maxlength="5" placeholder="Ej. K7PQ2" value="${esc(ui.joinCode)}" style="text-transform:uppercase"><button class="btn" data-act="joinCode" ${busy ? 'disabled' : ''}>Unirme</button></div>
      </section>
      ${myGames.length ? `<section class="card"><div class="label">Tus partidas</div><div class="list">${myGames.map((g) => gameRow(g, 'Volver')).join('')}</div></section>` : ''}
      ${openGames.length ? `<section class="card"><div class="label">Mesas esperando jugadores</div><div class="list">${openGames.map((g) => gameRow(g, 'Entrar')).join('')}</div></section>` : ''}
      ` : `<section class="card"><div class="label">En línea</div><p>${netChecked ? 'No hay conexión con el servidor de partidas. Recarga la página en unos minutos.' : 'Conectando…'}</p></section>`}
      <section class="card"><div class="label">Reglas rápidas</div>${rulesList()}</section>`;
  }

  // ---------- Lobby ----------
  function lobbySide(s) {
    const me = s.players.findIndex((p) => p.id === myId);
    const host = s.hostId === myId;
    const colors = E.PLAYER_COLORS.map((c, i) => {
      const taken = s.players.some((p, j) => j !== me && p.color === i);
      return `<button class="btn small${me >= 0 && s.players[me].color === i ? ' on' : ''}" data-act="color" data-c="${i}" ${taken || me < 0 ? 'disabled' : ''}><span style="color:${c.hex}">●</span> ${c.name}</button>`;
    }).join('');
    return `
      <section class="card turncard mine">
        <div class="label">Mesa de espera</div>
        <div class="instr">Código <span class="code" style="color:var(--accent)">${esc(session.code)}</span></div>
        <div class="instr-sub">Tus amigos abren esta página, escriben su nombre y este código. ${s.players.length} de 4 jugadores.</div>
        <button class="btn small" data-act="copy">${net && net.kind === 'api' ? 'Copiar enlace de invitación' : 'Copiar código'}</button>
      </section>
      <section class="card">
        <div class="label"><span>Jugadores</span><span>orden de la mesa</span></div>
        <div class="score">${s.players.map((p, i) => `<div class="prow">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</div><div class="pmeta">${i + 1}º en la mesa${p.id === s.hostId ? ' · anfitrión' : ''}</div></div><span></span></div>`).join('')}</div>
        ${me >= 0 ? `<div class="label">Tu color</div><div class="row">${colors}</div>` : s.players.length < 4 ? `<div class="row"><input type="text" id="name" maxlength="18" placeholder="Tu nombre" value="${esc(ui.name)}"><button class="btn primary" data-act="joinHere">Unirme</button></div>` : `<p class="note">La mesa está llena.</p>`}
      </section>
      <section class="card">
        ${host ? `<button class="btn primary big" data-act="start" ${s.players.length < 2 ? 'disabled' : ''}>Empezar partida</button><div class="row"><button class="btn small" data-act="reroll">Mezclar mapa</button><span class="note">Al empezar, todos tiran los dados: el más alto empieza.</span></div>`
          : `<p class="note">Esperando a que ${esc((s.players.find((p) => p.id === s.hostId) || {}).name || 'el anfitrión')} empiece la partida.</p>`}
        ${me >= 0 && !host ? `<button class="btn small ghost danger" data-act="leave">Salir de la mesa</button>` : ''}
      </section>
      <section class="card"><div class="label">Reglas rápidas</div>${rulesList()}</section>`;
  }

  // ---------- Game ----------
  function fullBar(s, vi) {
    const me = vi >= 0 ? s.players[vi] : null;
    let text = '', action = '';
    if (s.phase === 'order') {
      text = 'Tiren los dados para ver quién empieza';
      if (vi >= 0 && s.order.contenders.includes(vi) && s.order.rolls[vi] === undefined && !busy) action = `<button class="btn primary" data-act="orderRoll">Tirar dados</button>`;
    } else if (s.turn) {
      const ins = instruction(s, vi);
      text = ins.text;
      if (s.phase === 'main' && vi === s.turn.cur && !busy) {
        if (s.turn.step === 'roll') action = `<button class="btn primary" data-act="roll">Tirar dados</button>`;
        if (s.turn.step === 'main') action = ui.mode ? `<button class="btn" data-act="mode" data-m="">Cancelar</button>` : `<button class="btn primary" data-act="endTurn">Pasar turno</button>`;
        if (s.turn.step === 'steal' || s.turn.step === 'discard') action = `<button class="btn primary" data-act="closeMap">Elegir en el panel</button>`;
      }
    }
    const res = me && s.phase !== 'order' ? `<div class="fb-res">${RES.map((r) => `<span class="mini r-${r}">${B.resIcon(r, 16)}${me.res[r]}</span>`).join('')}</div>` : '';
    return `<div class="fb-text">${esc(text)}</div>${res}${action}`;
  }

  function orderSide(s, vi) {
    const o = s.order;
    const mine = vi >= 0 && o.contenders.includes(vi) && o.rolls[vi] === undefined;
    const rows = s.players.map((p, i) => {
      const d = o.dice[p.id];
      const contending = o.contenders.includes(i);
      const pending = contending && o.rolls[i] === undefined;
      const status = pending ? (o.round > 1 ? 'empate: vuelve a tirar' : 'por tirar') : contending ? `sacó ${o.rolls[i]}` : d ? `sacó ${d[0] + d[1]}` : '';
      return `<div class="prow${pending ? ' turn' : ''}">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId && session.kind === 'online' ? ' (tú)' : ''}</div><div class="pmeta">${i + 1}º en la mesa · ${status}</div></div><div class="dice">${d && !pending ? die(d[0], false) + die(d[1], false) : ''}</div></div>`;
    }).join('');
    const who = s.players[vi] || s.players[0];
    return `<section class="card turncard${mine ? ' mine' : ''}">
        <div class="whose"><i style="background:${pColor(who)}"></i>${mine ? (session.kind === 'online' ? 'Tu tirada' : `Tira ${esc(who.name)}`) : 'Esperando tiradas'}</div>
        <div><div class="instr">¿Quién empieza?</div><div class="instr-sub">Cada jugador tira los dados. El más alto empieza y el turno pasa hacia la derecha, en el orden de la mesa. Quien está a la izquierda del primero juega último. Si hay empate, solo los empatados vuelven a tirar.</div></div>
        ${mine && !busy ? `<button class="btn primary big" data-act="orderRoll">${session.kind === 'local' ? `Tirar dados (${esc(who.name)})` : 'Tirar dados'}</button>` : ''}
      </section>
      <section class="card"><div class="label"><span>Orden de la mesa</span><span>ronda ${o.round}</span></div><div class="score">${rows}</div></section>
      <section class="card"><div class="label">Bitácora</div><div class="log" id="log">${s.log.slice(-12).map((l) => `<div>${esc(l)}</div>`).join('')}</div></section>`;
  }

  function gameSide(s, vi) {
    if (s.phase === 'order') return orderSide(s, vi);
    const me = vi >= 0 ? s.players[vi] : null;
    const isCur = vi === s.turn.cur;
    const step = s.turn.step;
    const main = s.phase === 'main';
    const parts = [];

    // Turn card
    const ins = instruction(s, vi);
    const cur = s.players[s.turn.cur];
    let body = '';
    if (s.lastRoll && main) {
      const key = `${s.lastRoll.turnNo}-${s.lastRoll.d.join('')}-${s.lastRoll.by}`;
      const anim = key !== ui.lastDiceKey;
      ui.lastDiceKey = key;
      body += `<div class="dice">${die(s.lastRoll.d[0], anim)}${die(s.lastRoll.d[1], anim)}<span class="dice-sum">${s.lastRoll.d[0] + s.lastRoll.d[1]}</span><span class="note">tiró ${esc(s.players[s.lastRoll.by].name)}</span></div>`;
    }
    if (main && isCur && !busy) {
      if (step === 'roll') body += `<button class="btn primary big" data-act="roll">Tirar dados</button>`;
      if (step === 'main') body += `<div class="row">${ui.mode ? `<button class="btn" data-act="mode" data-m="">Cancelar</button>` : ''}<button class="btn primary big" data-act="endTurn" style="flex:1;width:auto">Pasar turno</button></div>`;
      if (step === 'steal') body += `<div class="list">${E.stealTargets(s, vi).map((t) => `<button class="btn" data-act="steal" data-t="${t}" style="justify-content:flex-start">${avatar(s.players[t], 26)} Robar a ${esc(s.players[t].name)} <span class="note">(${E.total(s.players[t].res)} cartas)</span></button>`).join('')}</div>`;
    }
    if (main && step === 'discard' && me && s.discards[vi] !== undefined) body += discardUI(s, vi);
    if (ui.pick && isCur && main) body += pickUI();
    if (main && s.turn.stolen && vi === s.turn.stolen.to && session.kind === 'online') body += `<p class="note">Robaste 1 ${E.RES_NAME[s.turn.stolen.r]} a ${esc(s.players[s.turn.stolen.from].name)}.</p>`;
    const who = ins.who || cur;
    parts.push(`<section class="card turncard${ins.mine ? ' mine' : ''}">
      <div class="whose"><i style="background:${pColor(who)}"></i>${ins.mine && session.kind === 'online' ? 'Tu turno' : `Turno de ${esc(who.name)}`}</div>
      <div><div class="instr">${esc(ins.text)}</div>${ins.sub ? `<div class="instr-sub">${esc(ins.sub)}</div>` : ''}</div>${body}</section>`);

    // Offer to respond to
    if (main && s.trade && me && !isCur) parts.push(offerForMe(s, vi));

    // Hand + build
    if (me) {
      parts.push(`<section class="card"><div class="label"><span>${session.kind === 'local' ? 'Cartas de ' + esc(me.name) : 'Tus cartas'}</span><span>${E.total(me.res)} en mano</span></div>
        <div class="hand">${RES.map((r) => `<div class="rcard r-${r}${me.res[r] ? '' : ' zero'}" title="${E.RES_NAME[r]}">${B.resIcon(r, 26)}<span class="n">${me.res[r]}</span><span class="l">${E.RES_NAME[r]}</span></div>`).join('')}</div>
        ${main && isCur ? buildUI(s, vi) : ''}</section>`);
    }

    // Scoreboard
    parts.push(`<section class="card"><div class="label"><span>Marcador</span><span>gana con 10</span></div><div class="score">${s.players.map((p, i) => {
      const vp = E.victoryPoints(s, i, i === vi || s.phase === 'ended');
      const tags = [s.longest.holder === i ? `<span class="tag soft">Camino ${s.longest.len}</span>` : '', s.army.holder === i ? `<span class="tag soft">Guardia ${s.army.size}</span>` : ''].join(' ');
      return `<div class="prow${s.turn.cur === i ? ' turn' : ''}">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId && session.kind === 'online' ? ' (tú)' : ''} ${tags}</div>
        <div class="pmeta"><span>${E.total(p.res)} cartas</span><span>${p.dev.length} desarrollo</span><span>${p.knights} guardianes</span></div></div><div class="pvp">${vp}<small>puntos</small></div></div>`;
    }).join('')}</div></section>`);

    // Tabs
    const devN = me ? me.dev.length : 0;
    const canTrade = main && isCur && step === 'main';
    const tabs = [['trade', 'Comercio', canTrade && s.trade], ['dev', `Cartas${devN ? ' (' + devN + ')' : ''}`, false], ['log', 'Bitácora', false], ['rules', 'Reglas', false]];
    let tabBody = '';
    if (ui.tab === 'trade') tabBody = me ? tradeUI(s, vi) : '<p class="note">Solo los jugadores pueden comerciar.</p>';
    if (ui.tab === 'dev') tabBody = me ? devUI(s, vi) : '';
    if (ui.tab === 'log') tabBody = `<div class="log" id="log">${s.log.slice(-40).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
    if (ui.tab === 'rules') tabBody = rulesList();
    parts.push(`<section class="card"><div class="tabs" role="tablist">${tabs.map(([k, l, dot]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}${dot ? '<span class="dotn"></span>' : ''}</button>`).join('')}</div>${tabBody}</section>`);
    parts.push(`<p class="note">Banco: ${RES.map((r) => `${E.RES_NAME[r]} ${s.bank[r]}`).join(' · ')} · Cartas de desarrollo ${s.deck.length}</p>`);
    return parts.join('');
  }

  function missing(p, cost) {
    const m = RES.filter((r) => (cost[r] || 0) > p.res[r]).map((r) => `${cost[r] - p.res[r]} ${E.RES_NAME[r]}`);
    return m.length ? 'Falta ' + m.join(', ') : '';
  }

  function buildUI(s, vi) {
    const p = s.players[vi];
    const ok = s.turn.step === 'main' && !busy;
    const item = (m, name, left, cost, spots) => {
      const why = !ok ? '' : !left ? 'No te quedan piezas' : missing(p, cost) || (!spots ? 'No hay lugar válido' : '');
      const can = ok && !why;
      return `<button class="bbtn${ui.mode === m ? ' on' : ''}" data-act="${m === 'dev' ? 'buyDev' : 'mode'}" data-m="${m}" ${can ? '' : 'disabled'}>${pieceIcon(m)}<span class="bname">${name} <small>(${left})</small></span>${costIcons(cost)}${why ? `<span class="why">${why}</span>` : ''}</button>`;
    };
    return `<div class="label"><span>Construir</span>${!ok && s.turn.step === 'roll' ? '<span>primero tira los dados</span>' : ''}</div><div class="build">
      ${item('road', 'Camino', p.left.road, E.COST.road, E.roadSpots(s, vi).length)}
      ${item('settle', 'Poblado', p.left.settlement, E.COST.settlement, E.settlementSpots(s, vi, false).length)}
      ${item('city', 'Ciudad', p.left.city, E.COST.city, E.citySpots(s, vi).length)}
      ${item('dev', 'Carta', s.deck.length, E.COST.dev, s.deck.length)}
    </div>`;
  }

  function stepperGrid(prefix, sel, max) {
    return `<div class="trade-grid">${RES.map((r) => `<div class="rcard r-${r}" title="${E.RES_NAME[r]}">${B.resIcon(r, 18)}<span class="n">${sel[r] || 0}</span>
      <div class="stepper"><button data-act="${prefix}" data-r="${r}" data-d="-1" ${(sel[r] || 0) <= 0 ? 'disabled' : ''} aria-label="Menos ${E.RES_NAME[r]}">−</button><button data-act="${prefix}" data-r="${r}" data-d="1" ${max && (sel[r] || 0) >= max[r] ? 'disabled' : ''} aria-label="Más ${E.RES_NAME[r]}">+</button></div></div>`).join('')}</div>`;
  }

  function discardUI(s, vi) {
    const need = s.discards[vi];
    const n = E.total(ui.discard);
    return `<div class="label"><span>Elige qué descartar</span><span>${n} de ${need}</span></div>${stepperGrid('disc', ui.discard, s.players[vi].res)}
      <button class="btn primary big" data-act="discardGo" ${n === need && !busy ? '' : 'disabled'}>Descartar ${need} cartas</button>`;
  }

  function pickUI() {
    const isPlenty = ui.pick === 'plenty';
    return `<div class="label">${isPlenty ? 'Cosecha: elige 2 recursos del banco' : 'Monopolio: elige un recurso'}</div>
      <div class="hand">${RES.map((r) => `<button class="rcard r-${r}" data-act="pickRes" data-r="${r}">${B.resIcon(r, 24)}<span class="n">${isPlenty ? ui.plenty.filter((x) => x === r).length : ''}</span><span class="l">${E.RES_NAME[r]}</span></button>`).join('')}</div>
      <div class="row">${isPlenty ? `<button class="btn primary" data-act="plentyGo" ${ui.plenty.length === 2 ? '' : 'disabled'}>Tomar ${ui.plenty.map((r) => E.RES_NAME[r]).join(' y ') || '…'}</button><button class="btn ghost" data-act="plentyClear">Borrar</button>` : ''}<button class="btn ghost" data-act="pickCancel">Cancelar</button></div>`;
  }

  function offerForMe(s, vi) {
    const t = s.trade, p = s.players[vi], from = s.players[s.turn.cur];
    const r = t.resp[vi];
    return `<section class="card turncard mine"><div class="label">Oferta de ${esc(from.name)}</div>
      <div class="offer"><div class="line"><b>Te da</b> ${miniRes(t.give)}</div><div class="line"><b>Te pide</b> ${miniRes(t.get)}</div>
      ${r === undefined ? `<div class="row"><button class="btn primary" data-act="respond" data-yes="1" ${E.hasRes(p, t.get) ? '' : 'disabled'}>Aceptar</button><button class="btn" data-act="respond" data-yes="0">Rechazar</button></div>${E.hasRes(p, t.get) ? '' : '<p class="note">No tienes lo que pide.</p>'}` : `<p class="note">Respondiste: ${r ? 'acepto. Esperando su decisión.' : 'no.'}</p>`}</div></section>`;
  }

  function tradeUI(s, vi) {
    const p = s.players[vi];
    const isCur = s.turn.cur === vi;
    const t = s.trade;
    if (!(s.phase === 'main' && isCur && s.turn.step === 'main')) return `<p class="note">Puedes comerciar en tu turno, después de tirar los dados.${t && !isCur ? ' Responde a la oferta de arriba.' : ''}</p>`;
    if (t) {
      const rows = s.players.map((o, i) => {
        if (i === vi) return '';
        const r = t.resp[i];
        const localBtns = session.kind === 'local' && r === undefined ? `<button class="btn small" data-act="respond" data-as="${i}" data-yes="1" ${E.hasRes(o, t.get) ? '' : 'disabled'}>Acepta</button><button class="btn small ghost" data-act="respond" data-as="${i}" data-yes="0">No</button>` : '';
        return `<div class="li">${avatar(o, 26)}<span class="grow">${esc(o.name)}: ${r === true ? '<b style="color:var(--good)">acepta</b>' : r === false ? 'rechaza' : 'pensando…'}</span>${r === true ? `<button class="btn small primary" data-act="acceptOffer" data-t="${i}">Cambiar</button>` : localBtns}</div>`;
      }).join('');
      return `<div class="offer"><div class="line"><b>Das</b> ${miniRes(t.give)}</div><div class="line"><b>Pides</b> ${miniRes(t.get)}</div><div class="list">${rows}</div><button class="btn small ghost" data-act="cancelOffer">Retirar oferta</button></div>`;
    }
    const rt = E.ratios(s, vi);
    const sub = `<div class="tabs"><button class="${ui.tradeTab === 'bank' ? 'on' : ''}" data-act="ttab" data-t="bank">Con el banco</button><button class="${ui.tradeTab === 'players' ? 'on' : ''}" data-act="ttab" data-t="players">Con jugadores</button></div>`;
    if (ui.tradeTab === 'bank') {
      const opt = (sel, id) => `<select id="${id}">${RES.map((r) => `<option value="${r}" ${sel === r ? 'selected' : ''}>${E.RES_NAME[r]}${id === 'bankGive' ? ` · ${rt[r]} por 1 · tienes ${p.res[r]}` : ''}</option>`).join('')}</select>`;
      const can = p.res[ui.bankGive] >= rt[ui.bankGive] && ui.bankGive !== ui.bankGet && s.bank[ui.bankGet] > 0;
      return `${sub}<div class="label">Doy</div>${opt(ui.bankGive, 'bankGive')}<div class="label">Recibo</div>${opt(ui.bankGet, 'bankGet')}
        <button class="btn" data-act="bankGo" ${can && !busy ? '' : 'disabled'}>Cambiar ${rt[ui.bankGive]} ${E.RES_NAME[ui.bankGive]} por 1 ${E.RES_NAME[ui.bankGet]}</button>
        <p class="note">Tus tasas: ${RES.map((r) => `${E.RES_NAME[r]} ${rt[r]}:1`).join(' · ')}. Un poblado junto a un puerto mejora la tasa.</p>`;
    }
    return `${sub}<div class="label">Ofrezco</div>${stepperGrid('give', ui.give, p.res)}<div class="label">Pido</div>${stepperGrid('get', ui.get, null)}
      <button class="btn" data-act="offerGo" ${E.total(ui.give) && E.total(ui.get) && !busy ? '' : 'disabled'}>Proponer a todos</button>`;
  }

  function devUI(s, vi) {
    const p = s.players[vi];
    if (!p.dev.length) return `<p class="note">No tienes cartas de desarrollo. Compra una con Lana, Trigo y Mineral.</p>`;
    const canPlay = s.turn.cur === vi && s.phase === 'main' && ['roll', 'main'].includes(s.turn.step) && !s.turn.devPlayed && !busy;
    const groups = {};
    p.dev.forEach((d) => { (groups[d.t] = groups[d.t] || { n: 0, ready: 0 }).n++; if (d.turn < s.turnNo) groups[d.t].ready++; });
    return `<div class="list">${Object.entries(groups).map(([t, g]) => `<div class="dev"><div class="grow"><b>${E.DEV_NAME[t]}${g.n > 1 ? ' ×' + g.n : ''}</b><span>${E.DEV_HELP[t]}${t !== 'vp' && !g.ready ? ' Podrás jugarla desde tu próximo turno.' : ''}</span></div>
      ${t !== 'vp' ? `<button class="btn small primary" data-act="dev" data-card="${t}" ${canPlay && g.ready ? '' : 'disabled'}>Jugar</button>` : ''}</div>`).join('')}</div>
      ${s.turn.devPlayed && s.turn.cur === vi ? '<p class="note">Ya jugaste una carta este turno.</p>' : ''}`;
  }

  function winOverlay(s) {
    if (s.phase !== 'ended' || ui.closedOver === session.code + s.turnNo) return '';
    const w = s.players[s.winner];
    return `<div class="overlay"><div class="card"><svg width="60" height="60" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5" fill="${pColor(w)}"/></svg><h2>${esc(w.name)} gana</h2><p>${E.victoryPoints(s, s.winner, true)} puntos en ${s.turnNo} turnos.</p><div class="row"><button class="btn" data-act="closeOver">Ver el mapa</button><button class="btn primary" data-act="exit">Volver al inicio</button></div></div></div>`;
  }

  // ---------- Events ----------
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'name') ui.name = el.value;
    else if (el.id === 'joinCode') ui.joinCode = el.value.toUpperCase();
    else if (el.dataset.ln !== undefined) { ui.localNames[+el.dataset.ln] = el.value; store.set('localNames', ui.localNames); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'bankGive') { ui.bankGive = el.value; render(); }
    if (el.id === 'bankGet') { ui.bankGet = el.value; render(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    if (ev.target.id === 'joinCode') joinOnline(ui.joinCode);
    else if (ev.target.id === 'name' && !session && net) createOnline();
  });

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const d = el.dataset;
    const s = session && session.state;
    const vi = s ? viewerIdx(s) : -1;
    const adjust = (obj, r, delta, max) => {
      const v = Math.max(0, (obj[r] || 0) + delta);
      obj[r] = max ? Math.min(v, max[r]) : v;
      render();
    };
    switch (d.act) {
      case 'noop': break;
      case 'exit': leaveSession(); break;
      case 'create': createOnline(); break;
      case 'join': joinOnline(d.code); break;
      case 'joinCode': joinOnline(ui.joinCode); break;
      case 'joinHere':
        if (!ui.name.trim()) return toast('Escribe tu nombre.');
        store.set('name', ui.name.trim());
        commit({ type: 'join', name: ui.name.trim() });
        break;
      case 'leave': await commit({ type: 'leave' }); leaveSession(); break;
      case 'color': commit({ type: 'color', color: +d.c }); break;
      case 'reroll': commit({ type: 'reroll' }); break;
      case 'shuffle': shuffleMap(); break;
      case 'orderRoll': commit({ type: 'orderRoll' }); break;
      case 'openMap': openFull(); break;
      case 'closeMap': closeFull(); break;
      case 'toggleMin': map.min = !map.min; render(); break;
      case 'zoomIn': setZoom(map.z * 1.35); break;
      case 'zoomOut': setZoom(map.z / 1.35); break;
      case 'zoomReset': map.z = 1; map.cx = 0; map.cy = 0; applyView(); break;
      case 'start': commit({ type: 'start' }); break;
      case 'copy':
      {
        const link = net && net.kind === 'api' ? `${location.origin}/#${session.code}` : session.code;
        try { await navigator.clipboard.writeText(link); toast(net && net.kind === 'api' ? 'Enlace copiado. Pásalo a tus amigos.' : 'Código copiado.'); } catch { toast(`Comparte: ${link}`); }
      }
        break;
      case 'lnAdd': if (ui.localNames.length < 4) { ui.localNames.push(''); store.set('localNames', ui.localNames); render(); } break;
      case 'lnDel': ui.localNames.splice(+d.i, 1); store.set('localNames', ui.localNames); render(); break;
      case 'localStart': {
        const names = ui.localNames.map((n, i) => n.trim() || `Jugador ${i + 1}`);
        let st = E.newGame('L0', names[0]);
        names.slice(1).forEach((n, i) => { st = E.apply(st, { type: 'join', name: n }, 'L' + (i + 1)).state; });
        st.board = JSON.parse(JSON.stringify(demo.board));
        st = E.apply(st, { type: 'start' }, 'L0').state;
        session = { kind: 'local', code: 'local', state: st };
        store.set('localGame', st);
        render();
        break;
      }
      case 'localResume': session = { kind: 'local', code: 'local', state: store.get('localGame', null) }; render(); break;
      case 'roll': commit({ type: 'roll' }); break;
      case 'endTurn': ui.mode = null; commit({ type: 'endTurn' }); break;
      case 'mode': ui.mode = d.m && ui.mode !== d.m ? d.m : null; render(); break;
      case 'vert': commit({ type: 'settle', v: +d.v }); break;
      case 'edge': commit({ type: 'road', e: +d.e }); break;
      case 'cityv': commit({ type: 'city', v: +d.v }); break;
      case 'hex': commit({ type: 'robber', h: +d.h }); break;
      case 'steal': commit({ type: 'steal', target: +d.t }); break;
      case 'buyDev': commit({ type: 'buyDev' }); break;
      case 'dev':
        if (d.card === 'plenty' || d.card === 'monopoly') { ui.pick = d.card; ui.plenty = []; render(); }
        else commit({ type: 'playDev', card: d.card });
        break;
      case 'pickRes':
        if (ui.pick === 'monopoly') commit({ type: 'playDev', card: 'monopoly', res: d.r });
        else if (ui.plenty.length < 2) { ui.plenty.push(d.r); render(); }
        break;
      case 'plentyGo': commit({ type: 'playDev', card: 'plenty', res: ui.plenty }); break;
      case 'plentyClear': ui.plenty = []; render(); break;
      case 'pickCancel': ui.pick = null; ui.plenty = []; render(); break;
      case 'disc': adjust(ui.discard, d.r, +d.d, s.players[vi].res); break;
      case 'discardGo': commit({ type: 'discard', res: ui.discard }); break;
      case 'give': adjust(ui.give, d.r, +d.d, s.players[vi].res); break;
      case 'get': adjust(ui.get, d.r, +d.d, null); break;
      case 'tab': ui.tab = d.t; render(); break;
      case 'ttab': ui.tradeTab = d.t; render(); break;
      case 'bankGo': commit({ type: 'bankTrade', give: ui.bankGive, get: ui.bankGet }); break;
      case 'offerGo': commit({ type: 'offer', give: ui.give, get: ui.get }); break;
      case 'respond': commit({ type: 'respond', accept: d.yes === '1', as: d.as !== undefined ? +d.as : undefined }); break;
      case 'acceptOffer': commit({ type: 'acceptOffer', target: +d.t }); break;
      case 'cancelOffer': commit({ type: 'cancelOffer' }); break;
      case 'closeOver': ui.closedOver = session.code + s.turnNo; render(); break;
    }
  });

  render();
})();
