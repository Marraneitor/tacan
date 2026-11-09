// Hexalia UI: accounts, online tables through the Vercel API (/api/game, /api/auth), the map and the side panel.
(() => {
  const E = Engine, RES = E.RES, B = Board;
  const $app = document.getElementById('app');

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hexalia:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { if (v === null) localStorage.removeItem('hexalia:' + k); else localStorage.setItem('hexalia:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  // ---------- Session state ----------
  let auth = store.get('auth', null); // { token, user }
  let myId = auth ? auth.user.id : null;
  let online = false, netChecked = false;
  let session = null; // { code, state }
  let unsubGame = null;
  let openGames = [], myGames = [];
  let busy = false;
  let skew = 0; // server clock minus this device's clock
  const shuffleIcon = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3.5c2 0 3.2.9 4.3 2.6l2.4 4.8c1.1 1.7 2.3 2.6 4.3 2.6H21M3 17h3.5c1.5 0 2.5-.5 3.4-1.5M14.1 8.5c.9-1 1.9-1.5 3.4-1.5H21M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let demo = E.newGame('demo', 'Demo');
  const shuffleMap = () => { demo = { ...demo, board: E.generateBoard() }; render(); };
  const ui = {
    mode: null, // 'road' | 'settle' | 'city'
    authTab: 'login', authName: '', authPass: '', authPass2: '',
    joinCode: '',
    discard: {}, tGive: {}, tGet: {},
    tradeTab: 'players', bankGive: null, bankGet: null,
    modal: null, modalData: null, confirmResign: false,
    pick: null, plenty: [], logOpen: false,
    toast: '', toastT: 0, lastDiceKey: '', closedOver: '',
  };
  let shown = { screen: null, boardKey: null };
  const map = { full: false, min: false, z: 1, cx: 0, cy: 0 };
  const VB = { x: -300, y: -282, w: 600, h: 564 };
  const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
  const canPanZoom = () => map.full || !isPhone() || map.z > 1;

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
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        setZoom(pinch.z * dist(a, b) / pinch.d);
      } else if (pts.size === 1 && moved && canPanZoom()) {
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
      if (!map.full && isPhone() && map.z === 1) { e.stopPropagation(); e.preventDefault(); openFull(); }
    }, true);
    bw.addEventListener('wheel', (e) => {
      if (!canPanZoom()) return;
      e.preventDefault();
      // Zoom toward the point under the cursor.
      const r = document.getElementById('board').getBoundingClientRect();
      const k = unitsPerPx(), z0 = map.z;
      const ux = (e.clientX - (r.left + r.width / 2)) * k, uy = (e.clientY - (r.top + r.height / 2)) * k;
      map.z = Math.min(4, Math.max(1, z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      map.cx += ux * (1 - z0 / map.z);
      map.cy += uy * (1 - z0 / map.z);
      applyView();
    }, { passive: false });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.modal) closeModal();
    else if (map.full) closeFull();
  });
  window.addEventListener('resize', () => applyView());

  function toast(msg) {
    ui.toast = msg;
    clearTimeout(ui.toastT);
    ui.toastT = setTimeout(() => { ui.toast = ''; render(); }, 3400);
    render();
  }

  const viewerIdx = (s) => (s && session ? s.players.findIndex((p) => p.id === myId) : -1);
  const pColor = (p) => E.PLAYER_COLORS[p.color].hex;

  // ---------- Server calls ----------
  const versions = {};
  async function call(path, opts = {}) {
    const headers = { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: 'Bearer ' + auth.token } : {}) };
    const r = await fetch(path, { method: opts.body ? 'POST' : 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (j.now) skew = j.now - Date.now();
    if (r.status === 401 && auth) { signOut(true); throw new Error(j.error || 'Tu sesión terminó. Vuelve a entrar.'); }
    if (!r.ok && r.status !== 404) throw new Error(j.error || 'Error del servidor. Inténtalo otra vez.');
    return { status: r.status, j };
  }
  const api = {
    async create(board) {
      const { j } = await call('/api/game', { body: { op: 'create', board } });
      versions[j.code] = j.v;
      return j;
    },
    async get(code) {
      const { status, j } = await call('/api/game?code=' + encodeURIComponent(code));
      if (status === 404) return null;
      versions[code] = j.v;
      return j.state;
    },
    async act(code, action) {
      try {
        const { j } = await call('/api/game', { body: { op: 'act', code, action } });
        if (j.ok) versions[code] = j.v;
        return j.error && !j.ok ? { ok: false, error: j.error } : j;
      } catch (e) { return { ok: false, error: e.message }; }
    },
    watch(code, cb) {
      let stop = false;
      const tick = async () => {
        if (stop) return;
        try {
          const { status, j } = await call(`/api/game?code=${encodeURIComponent(code)}&v=${versions[code] ?? -1}`);
          if (status === 404) cb(null);
          else if (!stop && j.state && j.v !== versions[code]) { versions[code] = j.v; cb(j.state); }
        } catch { /* retry on next tick */ }
        if (!stop) setTimeout(tick, document.hidden ? 4000 : 1200);
      };
      setTimeout(tick, 1200);
      return () => { stop = true; };
    },
    lists() {
      const tick = async () => {
        if (!session && auth) {
          try {
            const { j } = await call('/api/game?op=list');
            openGames = (j.open || []).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
            myGames = (j.mine || []).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
            if (!session) render();
          } catch { /* listing is optional */ }
        }
        setTimeout(tick, 6000);
      };
      tick();
    },
  };

  // ---------- Accounts ----------
  async function submitAuth() {
    const name = ui.authName.trim(), pass = ui.authPass;
    if (!name || !pass) return toast('Escribe tu usuario y contraseña.');
    if (ui.authTab === 'register' && pass !== ui.authPass2) return toast('Las contraseñas no coinciden.');
    busy = true; render();
    try {
      const { j } = await call('/api/auth', { body: { op: ui.authTab, name, password: pass } });
      if (!j.token) throw new Error(j.error || 'No se pudo entrar.');
      auth = { token: j.token, user: j.user };
      myId = j.user.id;
      store.set('auth', auth);
      ui.authPass = ''; ui.authPass2 = '';
      toast(ui.authTab === 'register' ? `¡Bienvenido, ${j.user.name}! Empiezas con ${j.user.rating} de rating.` : `Hola de nuevo, ${j.user.name}.`);
      openFromHash();
    } catch (e) { toast(e.message); }
    busy = false; render();
  }

  function signOut(expired) {
    if (!expired && auth) call('/api/auth', { body: { op: 'logout' } }).catch(() => {});
    auth = null; myId = null;
    store.set('auth', null);
    myGames = []; ui.modal = null;
    if (session) leaveSession();
    render();
  }

  async function refreshMe() {
    if (!auth) return null;
    try {
      const { j } = await call('/api/auth?op=me');
      if (j.user && auth) { auth.user = j.user; store.set('auth', auth); render(); }
      return j;
    } catch { return null; }
  }

  // ---------- Commit an action ----------
  async function commit(action) {
    if (busy || !session) return;
    busy = true; render();
    const r = await api.act(session.code, action);
    if (!r.ok) toast(r.error);
    else { session.state = r.state; afterChange(action, r.state); }
    busy = false; render();
  }

  function afterChange(action, s) {
    if (['road', 'settle', 'city'].includes(action.type)) ui.mode = null;
    if (action.type === 'discard') ui.discard = {};
    if (['offer', 'bid', 'acceptOffer'].includes(action.type)) { ui.tGive = {}; ui.tGet = {}; if (ui.modal === 'trade' && action.type === 'bid') ui.modal = null; }
    if (action.type === 'playDev') { ui.pick = null; ui.plenty = []; }
    if (action.type === 'resign') { ui.confirmResign = false; ui.modal = null; }
    if (s.rating && auth) refreshMe();
  }

  // ---------- Online games ----------
  async function createOnline() {
    if (!auth) return toast('Inicia sesión primero.');
    busy = true; render();
    try {
      const j = await api.create(JSON.parse(JSON.stringify(demo.board)));
      session = { code: j.code, state: j.state };
      location.hash = j.code;
      watchGame(j.code);
    } catch (e) {
      session = null;
      toast(e.message || 'No se pudo crear la partida.');
    }
    busy = false; render();
  }

  async function joinOnline(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return toast('Escribe el código de la partida.');
    busy = true; render();
    try {
      const st = await api.get(code);
      if (!st) { busy = false; render(); return toast('No existe una partida con ese código.'); }
      session = { code, state: st };
      if (location.hash !== '#' + code) history.replaceState(null, '', '#' + code);
      watchGame(code);
      busy = false;
      if (auth && !st.players.some((p) => p.id === myId) && st.phase === 'lobby' && st.players.length < 4) await commit({ type: 'join' });
    } catch (e) {
      busy = false;
      toast(e.message || 'No se pudo abrir la partida.');
    }
    render();
  }

  function watchGame(code) {
    if (unsubGame) unsubGame();
    unsubGame = api.watch(code, (st) => {
      if (!session || session.code !== code) return;
      if (!st) { toast('La partida fue borrada.'); return; }
      const rated = !session.state.rating && st.rating;
      session.state = st;
      if (rated) refreshMe();
      render();
    });
  }

  function leaveSession() {
    if (unsubGame) { unsubGame(); unsubGame = null; }
    session = null;
    ui.mode = null; ui.pick = null; ui.confirmResign = false;
    if (ui.modal === 'trade') ui.modal = null;
    if (location.hash) history.replaceState(null, '', location.pathname);
    render();
  }

  function openFromHash() {
    const code = (location.hash || '').replace('#', '').toUpperCase();
    if (online && auth && /^[A-Z0-9]{5}$/.test(code) && !session) joinOnline(code);
  }

  (async () => {
    if (/^https?:$/.test(location.protocol)) {
      try { online = (await fetch('/api/game?op=ping')).ok; } catch { online = false; }
    }
    netChecked = true;
    if (online) {
      if (auth) await refreshMe();
      api.lists();
      const code = (location.hash || '').replace('#', '').toUpperCase();
      if (/^[A-Z0-9]{5}$/.test(code)) {
        if (auth) joinOnline(code);
        else { ui.joinCode = code; ui.authTab = 'register'; }
      }
    }
    render();
  })();
  // Keep the "inactive player" timers fresh.
  setInterval(() => { if (session && session.state.phase !== 'lobby' && session.state.phase !== 'ended' && !busy) render(); }, 15000);

  // ---------- Small pieces ----------
  const dieFaces = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const die = (n, anim) => `<div class="die${anim ? ' roll' : ''}" aria-label="${n}">${Array.from({ length: 9 }, (_, i) => (dieFaces[n].includes(i + 1) ? '<i></i>' : '<span></span>')).join('')}</div>`;
  const ci = (r) => `<span class="ci r-${r}" title="${E.RES_NAME[r]}">${B.resIcon(r, 13)}</span>`;
  const costIcons = (cost) => `<span class="bcost">${RES.flatMap((r) => Array(cost[r] || 0).fill(ci(r))).join('')}</span>`;
  const miniRes = (res) => RES.filter((r) => res[r]).map((r) => `<span class="mini r-${r}">${B.resIcon(r, 16)}${res[r]}</span>`).join(' ') || '<span class="note">nada</span>';
  const avatar = (p, size = 34) => `<span class="avatar" style="background:${pColor(p)};width:${size}px;height:${size}px">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const I = (d, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON = {
    close: 'M6 6l12 12M18 6L6 18',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4',
    swap: 'M4 8h13l-3-3M20 16H7l3 3',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5',
    cards: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6M9 13h4',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
    shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z',
  };
  const pieceIcon = (kind) => {
    const c = '#ffb25c';
    if (kind === 'road') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true"><line x1="-12" y1="10" x2="12" y2="-10" stroke="#0b1418" stroke-width="9" stroke-linecap="round"/><line x1="-12" y1="10" x2="12" y2="-10" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>`;
    if (kind === 'settle') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true">${B.settlementShape(0, 2, c)}</svg>`;
    if (kind === 'city') return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true">${B.cityShape(0, 2, c)}</svg>`;
    return `<svg class="bico" viewBox="-18 -18 36 36" aria-hidden="true"><g transform="rotate(-8)"><rect x="-10" y="-14" width="20" height="28" rx="3" fill="#f6efe0" stroke="#0b1418" stroke-width="1.6"/><rect x="-7" y="-10" width="14" height="20" rx="2" fill="none" stroke="#c38a3c" stroke-width="1.4"/><path d="M0 -5l2 4 4 .5-3 3 .8 4.2L0 4.6-3.8 6.7-3 2.5l-3-3 4-.5z" fill="#c38a3c"/></g></svg>`;
  };
  const delta = (d) => `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</span>`;
  const fmtDate = (t) => { try { return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' }); } catch { return ''; } };
  const placeTxt = (n) => `${n}º`;

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
    if (s.turn && vi !== s.turn.cur) return `Turno de ${s.players[s.turn.cur].name}`;
    return '';
  }

  // ---------- Instruction for the turn card ----------
  function instruction(s, vi) {
    const cur = s.players[s.turn.cur];
    const mine = vi === s.turn.cur;
    if (s.phase === 'setup') {
      const second = s.setup.i >= (s.setup.round2 || s.players.length);
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
      return { mine, text: `${cur.name} ${what}`, sub: st === 'main' && vi >= 0 && !s.players[vi].out ? 'Puedes proponerle un cambio con el botón Comerciar.' : '' };
    }
    switch (st) {
      case 'roll': return { mine, text: 'Tira los dados', sub: 'Si quieres, antes puedes jugar un Guardián.' };
      case 'robber': return { mine, text: 'Mueve al bandido', sub: 'Toca una casilla en el mapa. Bloquea su producción y robas 1 carta a un vecino.' };
      case 'steal': return { mine, text: '¿A quién le robas?', sub: 'Se toma una carta al azar.' };
      case 'roadBuilding': return { mine, text: `Coloca ${s.turn.freeRoads} camino${s.turn.freeRoads > 1 ? 's' : ''} gratis`, sub: 'Toca un tramo brillante en el mapa.' };
      default: {
        const m = { road: 'Toca un tramo brillante en el mapa.', settle: 'Toca un punto brillante en el mapa.', city: 'Toca uno de tus poblados en el mapa.' }[ui.mode];
        return { mine, text: ui.mode ? { road: 'Construye un camino', settle: 'Funda un poblado', city: 'Mejora a ciudad' }[ui.mode] : 'Comercia y construye', sub: m || 'Construye, comercia o juega una carta. Cuando termines, pasa el turno.' };
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
      $app.innerHTML = `<header class="topbar"><div class="topbar-l" id="top"></div><div class="legend" id="legend"></div></header>
        <main class="split">
          <div class="board-wrap" id="bw"><svg id="board" viewBox="${B.VIEWBOX}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de la isla">${B.defs()}<g id="bs"></g><g id="bl"></g></svg><button class="infobtn" data-act="rules" aria-label="Reglas del juego" title="Reglas del juego">i</button><div class="hint" id="hint" hidden></div><div class="mapbtn" id="mapbtn"></div><div class="mapctl" id="mapctl"></div><div class="mapdice" id="mapdice"></div><div class="fullbar" id="fullbar"></div></div>
          <aside class="side" id="side"></aside>
        </main><div id="over"></div><div id="modal"></div><div id="toast"></div>`;
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
    const zoomBtns = `<button class="btn icon" data-act="zoomOut" aria-label="Alejar">${I('M5 12h14')}</button><button class="btn icon" data-act="zoomIn" aria-label="Acercar">${I('M12 5v14M5 12h14')}</button><button class="btn icon" data-act="zoomReset" aria-label="Ver todo el mapa">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}</button>`;
    let ctl = '';
    if (map.full) ctl = `${zoomBtns}<button class="btn primary" data-act="closeMap">${I(ICON.close)} Cerrar mapa</button>`;
    else if (isPhone()) ctl = `${map.min ? '' : zoomBtns}<button class="btn" data-act="openMap">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')} Ampliar</button><button class="btn" data-act="toggleMin">${map.min ? I('M6 15l6-6 6 6') + ' Ver mapa' : I('M6 9l6 6 6-6') + ' Minimizar'}</button>`;
    else ctl = `${zoomBtns}<button class="btn" data-act="openMap">${I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')} Pantalla completa</button>`;
    document.getElementById('mapctl').innerHTML = ctl;
    document.getElementById('mapdice').innerHTML = screen === 'game' && s.lastRoll && s.phase === 'main' ? die(s.lastRoll.d[0], false) + die(s.lastRoll.d[1], false) : '';
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
    const lgOld = document.getElementById('log');
    const logAtEnd = !lgOld || lgOld.scrollTop + lgOld.clientHeight >= lgOld.scrollHeight - 8;
    side.innerHTML = screen === 'home' ? homeSide() : screen === 'lobby' ? lobbySide(s) : gameSide(s, vi);
    side.scrollTop = scroll;
    const lg = document.getElementById('log');
    if (lg && logAtEnd) lg.scrollTop = lg.scrollHeight;

    const modal = document.getElementById('modal');
    const mScroll = modal.querySelector('.sheet-body') ? modal.querySelector('.sheet-body').scrollTop : 0;
    modal.innerHTML = modalHtml(s, vi);
    if (modal.querySelector('.sheet-body')) modal.querySelector('.sheet-body').scrollTop = mScroll;
    document.body.classList.toggle('modal-open', !!ui.modal);

    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus({ preventScroll: true }); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch { /* not a text field */ } }
    }
    document.getElementById('over').innerHTML = screen === 'game' ? winOverlay(s) : '';
    document.getElementById('toast').innerHTML = ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '';
  }

  function topbar() {
    const code = session ? `<span class="chip">Mesa <strong>${esc(session.code)}</strong></span>` : '';
    const sync = busy ? `<span class="chip">Guardando…</span>` : '';
    const me = auth ? `<button class="chip userchip" data-act="profile" title="Tu perfil">${I(ICON.user, 16)}<span class="uname">${esc(auth.user.name)}</span><span class="elo">${auth.user.rating}</span></button>` : '';
    const rank = online ? `<button class="btn small ghost" data-act="ranking">${I(ICON.trophy, 16)}<span class="hide-s">Ranking</span></button>` : '';
    const exit = session ? `<button class="btn small ghost" data-act="exit">Salir</button>` : '';
    return `<button class="brand" data-act="${session ? 'exit' : 'noop'}" aria-label="Hexalia, inicio">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5" fill="var(--accent)"/><path d="M9 21h14v-6l-7-6-7 6z" fill="#0a1d29"/></svg>
        <h1>Hexalia</h1></button><span class="spacer"></span>${code}${sync}${rank}${me}${exit}`;
  }

  // ---------- Modals: rules, trade, ranking, profile ----------
  function openModal(name) {
    ui.modal = name;
    ui.modalData = null;
    render();
    if (name === 'ranking') call('/api/auth?op=ranking').then(({ j }) => { if (ui.modal === 'ranking') { ui.modalData = j; render(); } }).catch((e) => toast(e.message));
    if (name === 'profile') refreshMe().then((j) => { if (ui.modal === 'profile') { ui.modalData = j || { history: [] }; render(); } });
  }
  function closeModal() { ui.modal = null; ui.modalData = null; ui.confirmResign = false; render(); }

  function sheet(title, body, wide) {
    return `<div class="sheet-back" data-act="closeModal"><div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-stop="1">
      <div class="sheet-head"><h2>${title}</h2><button class="btn icon ghost" data-act="closeModal" aria-label="Cerrar">${I(ICON.close)}</button></div>
      <div class="sheet-body">${body}</div></div></div>`;
  }

  function modalHtml(s, vi) {
    if (!ui.modal) return '';
    if (ui.modal === 'rules') return sheet('Reglas', rulesHtml(), true);
    if (ui.modal === 'ranking') return sheet('Ranking', rankingHtml());
    if (ui.modal === 'profile') return auth ? sheet('Tu perfil', profileHtml()) : '';
    if (ui.modal === 'trade') return session && vi >= 0 && s.phase === 'main' ? sheet('Comerciar', tradeHtml(s, vi)) : '';
    return '';
  }

  function rulesHtml() {
    const cost = (name, c) => `<div class="li"><span class="grow"><b>${name}</b></span>${costIcons(c)}</div>`;
    return `<div class="rules-grid">
      <section><h3>Cómo se gana</h3><ul class="rules">
        <li>Gana quien llegue a <b>10 puntos</b> en su turno.</li>
        <li>Poblado 1 · Ciudad 2 · Camino más largo 2 · Guardia mayor 2 · Monumento 1.</li>
      </ul></section>
      <section><h3>Costos</h3><div class="list">${cost('Camino', E.COST.road)}${cost('Poblado', E.COST.settlement)}${cost('Ciudad', E.COST.city)}${cost('Carta de desarrollo', E.COST.dev)}</div></section>
      <section><h3>Turno</h3><ul class="rules">
        <li><b>Inicio:</b> cada uno pone un poblado y un camino; luego, en orden inverso, otro poblado y camino. El segundo poblado da un recurso de cada casilla vecina.</li>
        <li><b>Distancia:</b> entre dos poblados siempre queda al menos un cruce libre. Luego, cada poblado nuevo debe tocar uno de tus caminos.</li>
        <li><b>Producción:</b> al tirar, las casillas con ese número dan 1 carta a cada poblado y 2 a cada ciudad que las toquen.</li>
        <li><b>El 7:</b> nadie produce. Si tienes más de 7 cartas, descartas la mitad. Quien tiró mueve al bandido y roba 1 carta a un vecino de esa casilla.</li>
      </ul></section>
      <section><h3>Comercio</h3><ul class="rules">
        <li>En tu turno, después de tirar, puedes cambiar con cualquier jugador o con el banco.</li>
        <li><b>Banco:</b> 4 iguales por 1. Un poblado en un puerto <b>3:1</b> lo mejora a 3 por 1; en un puerto de un recurso, a <b>2 por 1</b> de ese recurso.</li>
        <li>Fuera de tu turno solo puedes proponer cambios al jugador en turno.</li>
        <li>No se puede regalar cartas: cada cambio da y pide algo, y nunca el mismo recurso.</li>
      </ul></section>
      <section><h3>Cartas de desarrollo</h3><ul class="rules">
        <li>14 Guardianes, 5 Monumentos, 2 Constructores, 2 Cosechas, 2 Monopolios.</li>
        <li>Una por turno y no el mismo turno que la compras. Los Monumentos cuentan solos.</li>
        <li><b>Camino más largo:</b> 5 tramos seguidos o más. <b>Guardia mayor:</b> 3 Guardianes o más. Si alguien te supera, te lo quita.</li>
      </ul></section>
      <section><h3>Rating</h3><ul class="rules">
        <li>Todos empiezan con <b>1500</b>. Se usa la fórmula Elo del ajedrez.</li>
        <li>Al terminar, cada jugador se compara con cada rival: ganas el duelo si quedaste por encima (más puntos; el ganador siempre es 1º), empatas con los mismos puntos y lo pierdes si quedaste debajo.</li>
        <li>Ganarle a alguien con más rating suma más; perder contra alguien con menos rating resta más. Una partida de 4 mueve el rating lo mismo que una de ajedrez.</li>
        <li>Si abandonas o te declaran inactivo (5 minutos sin jugar en tu turno), quedas último.</li>
      </ul></section>
    </div>`;
  }

  function rankingHtml() {
    const d = ui.modalData;
    if (!d) return '<p class="note">Cargando…</p>';
    if (!d.top.length) return '<p class="note">Todavía no hay partidas terminadas. ¡Juega la primera!</p>';
    return `<div class="rank">${d.top.map((r, i) => `<div class="rrow${r.id === myId ? ' me' : ''}"><span class="pos">${i + 1}</span><span class="grow"><b>${esc(r.name)}</b><small>${r.games} partida${r.games === 1 ? '' : 's'} · ${r.wins} victoria${r.wins === 1 ? '' : 's'}</small></span><span class="elo">${r.rating}</span></div>`).join('')}</div>`;
  }

  function profileHtml() {
    const u = auth.user, d = ui.modalData;
    const hist = d ? (d.history || []) : null;
    return `<div class="pstats"><div><b>${u.rating}</b><small>rating</small></div><div><b>${u.peak || u.rating}</b><small>máximo</small></div><div><b>${u.games}</b><small>partidas</small></div><div><b>${u.wins}</b><small>victorias</small></div></div>
      <div class="label">Últimas partidas</div>
      ${hist === null ? '<p class="note">Cargando…</p>' : hist.length ? `<div class="list">${hist.map((h) => `<div class="li"><span class="place p${h.place}">${placeTxt(h.place)}</span><span class="grow">de ${h.n} · contra ${esc((h.rivals || []).join(', '))}<small>${fmtDate(h.at)}${h.out ? ' · abandono' : ''}</small></span>${delta(h.delta)}</div>`).join('')}</div>` : '<p class="note">Aún no terminaste ninguna partida.</p>'}
      <button class="btn ghost danger" data-act="logout">Cerrar sesión</button>`;
  }

  // ---------- Home ----------
  function authCard() {
    const reg = ui.authTab === 'register';
    return `<section class="card">
      <div class="tabs" role="tablist"><button class="${reg ? '' : 'on'}" data-act="authTab" data-t="login">Entrar</button><button class="${reg ? 'on' : ''}" data-act="authTab" data-t="register">Crear cuenta</button></div>
      <form class="form" data-form="auth">
        <label class="label" for="authName">Usuario</label>
        <input type="text" id="authName" maxlength="18" autocomplete="username" placeholder="Ej. joel" value="${esc(ui.authName)}">
        <label class="label" for="authPass">Contraseña</label>
        <input type="password" id="authPass" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="${reg ? 'Mínimo 6 caracteres' : 'Tu contraseña'}" value="${esc(ui.authPass)}">
        ${reg ? `<label class="label" for="authPass2">Repite la contraseña</label><input type="password" id="authPass2" autocomplete="new-password" value="${esc(ui.authPass2)}">` : ''}
        <button class="btn primary big" type="submit" ${busy ? 'disabled' : ''}>${reg ? 'Crear cuenta y jugar' : 'Entrar'}</button>
      </form>
      <p class="note">${reg ? 'Tu usuario es el nombre que verán los demás. Empiezas con 1500 de rating.' : '¿Primera vez? Pulsa «Crear cuenta».'}${ui.joinCode ? ` Después entrarás a la mesa <b class="code">${esc(ui.joinCode)}</b>.` : ''}</p>
    </section>`;
  }

  function homeSide() {
    const gameRow = (g, label) => `<div class="li"><span class="code">${esc(g.code)}</span><span class="grow">${esc((g.names || []).join(', '))}</span><button class="btn small" data-act="join" data-code="${esc(g.code)}">${label}</button></div>`;
    const hero = `<section class="card hero"><h2>Funda poblados, comercia y llega a 10 puntos.</h2><p>Juego de colonización por turnos para 2 a 4 jugadores, cada uno desde su propio teléfono o computadora. Cada partida terminada mueve tu rating.</p></section>`;
    if (!online) return `${hero}<section class="card"><div class="label">En línea</div><p>${netChecked ? 'No hay conexión con el servidor de partidas. Recarga la página en unos minutos.' : 'Conectando…'}</p></section>`;
    if (!auth) return hero + authCard();
    const u = auth.user;
    return `
      <section class="card welcome"><div class="row"><span class="avatar big" style="background:var(--accent)">${esc(u.name.charAt(0).toUpperCase())}</span><div class="grow"><div class="pname">${esc(u.name)}</div><div class="pmeta"><span><b class="elo">${u.rating}</b> de rating</span><span>${u.games} partidas</span><span>${u.wins} victorias</span></div></div></div>
        <button class="btn primary big" data-act="create" ${busy ? 'disabled' : ''}>Crear mesa con este mapa</button>
        <div class="label">¿Te pasaron un código?</div>
        <div class="row"><input type="text" id="joinCode" maxlength="5" placeholder="Ej. K7PQ2" value="${esc(ui.joinCode)}" style="text-transform:uppercase"><button class="btn" data-act="joinCode" ${busy ? 'disabled' : ''}>Unirme</button></div>
        <p class="note">El mapa de la izquierda es el que usarás: pulsa «Mezclar mapa» para cambiarlo.</p>
      </section>
      ${myGames.length ? `<section class="card"><div class="label">Tus partidas en curso</div><div class="list">${myGames.map((g) => gameRow(g, 'Volver')).join('')}</div></section>` : ''}
      ${openGames.length ? `<section class="card"><div class="label">Mesas esperando jugadores</div><div class="list">${openGames.map((g) => gameRow(g, 'Entrar')).join('')}</div></section>` : ''}`;
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
        <div class="instr-sub">Pasa el enlace a tus amigos: entran con su cuenta y se sientan solos. ${s.players.length} de 4 jugadores.</div>
        <button class="btn small" data-act="copy">Copiar enlace de invitación</button>
      </section>
      <section class="card">
        <div class="label"><span>Jugadores</span><span>rating</span></div>
        <div class="score">${s.players.map((p, i) => `<div class="prow">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</div><div class="pmeta">${i + 1}º en la mesa${p.id === s.hostId ? ' · anfitrión' : ''}</div></div><span class="elo">${p.rating || ''}</span></div>`).join('')}</div>
        ${me >= 0 ? `<div class="label">Tu color</div><div class="row">${colors}</div>` : !auth ? `<p class="note">Inicia sesión para sentarte en esta mesa.</p><button class="btn primary" data-act="exit">Entrar o crear cuenta</button>` : s.players.length < 4 ? `<button class="btn primary" data-act="joinHere">Sentarme en la mesa</button>` : `<p class="note">La mesa está llena.</p>`}
      </section>
      <section class="card">
        ${host ? `<button class="btn primary big" data-act="start" ${s.players.length < 2 ? 'disabled' : ''}>Empezar partida</button><div class="row"><button class="btn small" data-act="reroll">Mezclar mapa</button><span class="note">Al empezar, todos tiran los dados: el más alto empieza.</span></div>`
          : `<p class="note">Esperando a que ${esc((s.players.find((p) => p.id === s.hostId) || {}).name || 'el anfitrión')} empiece la partida.</p>`}
        ${me >= 0 && !host ? `<button class="btn small ghost danger" data-act="leave">Salir de la mesa</button>` : ''}
      </section>`;
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

  // Players the table is waiting on who have been idle long enough to be declared out.
  function idlePlayers(s, vi) {
    if (vi < 0 || s.players[vi].out || !['order', 'setup', 'main'].includes(s.phase)) return [];
    const now = Date.now() + skew;
    return E.waitingOn(s).filter((t) => t !== vi && E.idleFor(s, t, now) >= E.IDLE_MS);
  }
  function idleCard(s, vi) {
    const idle = idlePlayers(s, vi);
    if (!idle.length) return '';
    return `<section class="card warn">${idle.map((t) => `<div class="row"><span class="grow"><b>${esc(s.players[t].name)}</b> lleva más de 5 minutos sin jugar.</span><button class="btn small" data-act="claimIdle" data-t="${t}" ${busy ? 'disabled' : ''}>Declarar abandono</button></div>`).join('')}<p class="note">Si lo declaras, queda último en esta partida y la mesa sigue sin él.</p></section>`;
  }

  function orderSide(s, vi) {
    const o = s.order;
    const mine = vi >= 0 && o.contenders.includes(vi) && o.rolls[vi] === undefined;
    const rows = s.players.map((p, i) => {
      const d = o.dice[p.id];
      const contending = o.contenders.includes(i);
      const pending = contending && o.rolls[i] === undefined;
      const status = p.out ? 'abandonó' : pending ? (o.round > 1 ? 'empate: vuelve a tirar' : 'por tirar') : contending ? `sacó ${o.rolls[i]}` : d ? `sacó ${d[0] + d[1]}` : '';
      return `<div class="prow${pending ? ' turn' : ''}${p.out ? ' out' : ''}">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</div><div class="pmeta">${i + 1}º en la mesa · ${status}</div></div><div class="dice">${d && !pending ? die(d[0], false) + die(d[1], false) : ''}</div></div>`;
    }).join('');
    const who = s.players[vi] || s.players[0];
    return `<section class="card turncard${mine ? ' mine' : ''}">
        <div class="whose"><i style="background:${pColor(who)}"></i>${mine ? 'Tu tirada' : 'Esperando tiradas'}</div>
        <div><div class="instr">¿Quién empieza?</div><div class="instr-sub">Cada jugador tira los dados. El más alto empieza y el turno sigue el orden de la mesa. Si hay empate, solo los empatados vuelven a tirar.</div></div>
        ${mine && !busy ? `<button class="btn primary big" data-act="orderRoll">Tirar dados</button>` : ''}
      </section>
      ${idleCard(s, vi)}
      <section class="card"><div class="label"><span>Orden de la mesa</span><span>ronda ${o.round}</span></div><div class="score">${rows}</div></section>
      ${logCard(s)}${resignCard(s, vi)}`;
  }

  function logCard(s) {
    return `<details class="card logcard" ${ui.logOpen ? 'open' : ''}><summary class="label"><span>Bitácora</span><span class="last">${esc(s.log[s.log.length - 1] || '')}</span></summary><div class="log" id="log">${s.log.slice(-40).map((l) => `<div>${esc(l)}</div>`).join('')}</div></details>`;
  }

  function resignCard(s, vi) {
    if (vi < 0 || s.players[vi].out || !['order', 'setup', 'main'].includes(s.phase)) return '';
    if (!ui.confirmResign) return `<div class="resign"><button class="btn small ghost" data-act="resignAsk">${I(ICON.flag, 16)} Abandonar partida</button></div>`;
    return `<section class="card warn"><b>¿Abandonar la partida?</b><p class="note">Quedarás último y perderás rating, como si perdieras contra todos.</p><div class="row"><button class="btn danger" data-act="resignGo" ${busy ? 'disabled' : ''}>Sí, abandonar</button><button class="btn ghost" data-act="resignNo">Seguir jugando</button></div></section>`;
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
    if (main && s.turn.stolen && vi === s.turn.stolen.to) body += `<p class="note">Robaste 1 ${E.RES_NAME[s.turn.stolen.r]} a ${esc(s.players[s.turn.stolen.from].name)}.</p>`;
    if (me && me.out) body += `<p class="note">Abandonaste esta partida. Puedes seguir mirando.</p>`;
    const who = ins.who || cur;
    parts.push(`<section class="card turncard${ins.mine ? ' mine' : ''}">
      <div class="whose"><i style="background:${pColor(who)}"></i>${s.phase === 'ended' ? 'Partida terminada' : ins.mine ? 'Tu turno' : `Turno de ${esc(who.name)}`}</div>
      <div><div class="instr">${esc(ins.text)}</div>${ins.sub ? `<div class="instr-sub">${esc(ins.sub)}</div>` : ''}</div>${body}</section>`);
    parts.push(idleCard(s, vi));

    // Offers waiting for an answer
    if (main && s.trade && me && !isCur && !me.out) parts.push(offerForMe(s, vi));
    if (main && isCur && Object.keys(s.bids || {}).length) parts.push(bidsForMe(s, vi));
    if (main && isCur && s.trade) parts.push(myOfferCard(s, vi));

    // Hand, actions, build
    if (me && !me.out) parts.push(handCard(s, vi));

    // Players
    parts.push(playersCard(s, vi));
    parts.push(logCard(s));
    parts.push(resignCard(s, vi));
    return parts.join('');
  }

  function handCard(s, vi) {
    const me = s.players[vi];
    const isCur = vi === s.turn.cur;
    const main = s.phase === 'main';
    const canTrade = main && s.turn.step === 'main' && (isCur ? !s.trade : true);
    const tradeLabel = isCur ? 'Comerciar' : `Proponer cambio a ${esc(s.players[s.turn.cur].name)}`;
    const myBid = s.bids && s.bids[vi];
    const devN = me.dev.length;
    return `<section class="card hand-card"><div class="label"><span>Tus cartas</span><span>${E.total(me.res)} en mano</span></div>
      <div class="hand">${RES.map((r) => `<div class="rcard r-${r}${me.res[r] ? '' : ' zero'}" title="${E.RES_NAME[r]}">${B.resIcon(r, 26)}<span class="n">${me.res[r]}</span><span class="l">${E.RES_NAME[r]}</span></div>`).join('')}</div>
      ${main ? `<div class="actions"><button class="btn${isCur ? ' accent' : ''}" data-act="tradeOpen" ${canTrade && !busy ? '' : 'disabled'}>${I(ICON.swap)} ${tradeLabel}</button></div>` : ''}
      ${myBid && !isCur ? `<div class="offer small"><div class="line"><b>Tu propuesta:</b> das ${miniRes(myBid.give)} y pides ${miniRes(myBid.get)}</div><div class="row"><span class="note grow">Esperando respuesta…</span><button class="btn small ghost" data-act="withdrawBid" ${busy ? 'disabled' : ''}>Retirar</button></div></div>` : ''}
      ${main && isCur ? buildUI(s, vi) : ''}
      ${devN ? devUI(s, vi) : ''}</section>`;
  }

  function playersCard(s, vi) {
    return `<section class="card"><div class="label"><span>Jugadores</span><span>gana con ${E.WIN_VP}</span></div><div class="score">${s.players.map((p, i) => {
      const vp = E.victoryPoints(s, i, i === vi || s.phase === 'ended');
      const tags = [s.longest.holder === i ? `<span class="tag soft" title="Camino más largo">Camino ${s.longest.len}</span>` : '', s.army.holder === i ? `<span class="tag soft" title="Guardia mayor">Guardia ${s.army.size}</span>` : '', p.out ? '<span class="tag out">abandonó</span>' : ''].join(' ');
      const pct = Math.min(100, (vp / E.WIN_VP) * 100);
      return `<div class="prow${s.turn.cur === i && s.phase !== 'ended' ? ' turn' : ''}${p.out ? ' out' : ''}">${avatar(p)}<div style="min-width:0"><div class="pname">${esc(p.name)}${p.id === myId ? ' (tú)' : ''} ${p.rating ? `<span class="elo small">${p.rating}</span>` : ''}</div>
        <div class="pmeta"><span title="Cartas de recursos">${I(ICON.cards, 13)} ${E.total(p.res)} carta${E.total(p.res) === 1 ? '' : 's'}</span><span title="Cartas de desarrollo">${I(ICON.star, 13)} ${p.dev.length}</span><span title="Guardianes jugados">${I(ICON.shield, 13)} ${p.knights}</span>${tags}</div>
        <div class="vpbar"><i style="width:${pct}%;background:${pColor(p)}"></i></div></div><div class="pvp">${vp}<small>puntos</small></div></div>`;
    }).join('')}</div></section>`;
  }

  function missing(p, cost) {
    const m = RES.filter((r) => (cost[r] || 0) > p.res[r]).map((r) => `${cost[r] - p.res[r]} ${E.RES_NAME[r]}`);
    return m.length ? 'Falta ' + m.join(', ') : '';
  }
  const missingRes = (p, cost) => { const o = {}; RES.forEach((r) => { const d = (cost[r] || 0) - p.res[r]; if (d > 0) o[r] = d; }); return o; };

  function buildUI(s, vi) {
    const p = s.players[vi];
    const ok = s.turn.step === 'main' && !busy;
    const item = (m, name, left, cost, spots) => {
      const lack = missing(p, cost);
      const why = !ok ? '' : !left ? 'No te quedan piezas' : lack || (!spots ? 'No hay lugar válido' : '');
      const can = ok && !why;
      // Missing only resources: the tile offers to ask for them in a trade.
      const ask = ok && left && spots && lack && !s.trade;
      return `<button class="bbtn${ui.mode === m ? ' on' : ''}${ask ? ' ask' : ''}" data-act="${ask ? 'askFor' : m === 'dev' ? 'buyDev' : 'mode'}" data-m="${m}" ${can || ask ? '' : 'disabled'}>${pieceIcon(m)}<span class="bname">${name} <small>(${left})</small></span>${costIcons(cost)}${why ? `<span class="why">${why}${ask ? ' · <u>conseguir</u>' : ''}</span>` : ''}</button>`;
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
    const can = E.hasRes(p, t.get);
    return `<section class="card turncard mine"><div class="whose">${avatar(from, 22)} ${esc(from.name)} ofrece un cambio</div>
      <div class="deal"><div><small>Recibes</small>${miniRes(t.give)}</div><span class="arrow">${I(ICON.swap)}</span><div><small>Entregas</small>${miniRes(t.get)}</div></div>
      ${r === undefined ? `<div class="row"><button class="btn primary" data-act="respond" data-yes="1" ${can && !busy ? '' : 'disabled'}>Acepto</button><button class="btn" data-act="respond" data-yes="0" ${busy ? 'disabled' : ''}>No, gracias</button><button class="btn ghost" data-act="counter">Contraoferta</button></div>${can ? '' : '<p class="note">No tienes lo que pide.</p>'}` : `<p class="note">${r ? 'Aceptaste. Esperando a que confirme.' : 'Lo rechazaste.'}</p>`}</section>`;
  }

  function myOfferCard(s, vi) {
    const t = s.trade;
    const rows = s.players.map((o, i) => {
      if (i === vi || o.out) return '';
      const r = t.resp[i];
      return `<div class="li">${avatar(o, 26)}<span class="grow">${esc(o.name)}: ${r === true ? '<b style="color:var(--good)">acepta</b>' : r === false ? 'no quiere' : 'pensando…'}</span>${r === true ? `<button class="btn small primary" data-act="acceptOffer" data-t="${i}" ${busy ? 'disabled' : ''}>Cambiar</button>` : ''}</div>`;
    }).join('');
    return `<section class="card turncard mine"><div class="label">Tu oferta a todos</div>
      <div class="deal"><div><small>Das</small>${miniRes(t.give)}</div><span class="arrow">${I(ICON.swap)}</span><div><small>Pides</small>${miniRes(t.get)}</div></div>
      <div class="list">${rows}</div><button class="btn small ghost" data-act="cancelOffer" ${busy ? 'disabled' : ''}>Retirar oferta</button></section>`;
  }

  function bidsForMe(s, vi) {
    const me = s.players[vi];
    const rows = Object.entries(s.bids).map(([o, b]) => {
      const other = s.players[o];
      const can = E.hasRes(me, b.get) && !busy && s.turn.step === 'main';
      return `<div class="offer"><div class="line">${avatar(other, 24)}<b>${esc(other.name)} te propone</b></div>
        <div class="deal"><div><small>Recibes</small>${miniRes(b.give)}</div><span class="arrow">${I(ICON.swap)}</span><div><small>Entregas</small>${miniRes(b.get)}</div></div>
        <div class="row"><button class="btn primary" data-act="acceptBid" data-t="${o}" ${can ? '' : 'disabled'}>Aceptar</button><button class="btn" data-act="rejectBid" data-t="${o}" ${busy ? 'disabled' : ''}>Rechazar</button></div>
        ${E.hasRes(me, b.get) ? '' : '<p class="note">No tienes lo que te pide.</p>'}</div>`;
    }).join('');
    return `<section class="card turncard mine"><div class="label">Propuestas para ti</div>${rows}</section>`;
  }

  // ---------- Trade sheet ----------
  // One table: a row per resource, with what you give and what you ask. It follows the rules as you type:
  // you can't give more than you have, and a resource can't be on both sides.
  function tradeTable(p) {
    return `<div class="ttable"><div class="th"><span></span><span>Das</span><span>Pides</span></div>${RES.map((r) => {
      const g = ui.tGive[r] || 0, w = ui.tGet[r] || 0;
      return `<div class="tr"><span class="tres"><span class="ci r-${r}">${B.resIcon(r, 16)}</span><span><b>${E.RES_NAME[r]}</b><small>tienes ${p.res[r]}</small></span></span>
        <span class="step${g ? ' on give' : ''}"><button data-act="tg" data-r="${r}" data-d="-1" ${g ? '' : 'disabled'} aria-label="Dar una ${E.RES_NAME[r]} menos">−</button><b>${g}</b><button data-act="tg" data-r="${r}" data-d="1" ${g < p.res[r] ? '' : 'disabled'} aria-label="Dar una ${E.RES_NAME[r]} más">+</button></span>
        <span class="step${w ? ' on get' : ''}"><button data-act="tw" data-r="${r}" data-d="-1" ${w ? '' : 'disabled'} aria-label="Pedir una ${E.RES_NAME[r]} menos">−</button><b>${w}</b><button data-act="tw" data-r="${r}" data-d="1" ${w < 9 ? '' : 'disabled'} aria-label="Pedir una ${E.RES_NAME[r]} más">+</button></span></div>`;
    }).join('')}</div>`;
  }

  function quickAsk(p) {
    const items = [['road', 'Camino', E.COST.road], ['settle', 'Poblado', E.COST.settlement], ['city', 'Ciudad', E.COST.city], ['dev', 'Carta', E.COST.dev]].filter(([, , c]) => E.total(missingRes(p, c)));
    if (!items.length) return '';
    return `<div class="quick"><span class="note">Pedir lo que me falta para:</span>${items.map(([m, n]) => `<button class="btn small" data-act="askFill" data-m="${m}">${n}</button>`).join('')}</div>`;
  }

  function tradeHtml(s, vi) {
    const p = s.players[vi];
    const isCur = s.turn.cur === vi;
    const cur = s.players[s.turn.cur];
    if (p.out) return '<p class="note">Ya no estás en la partida.</p>';
    if (s.turn.step !== 'main') return `<p class="note">${isCur ? 'Termina la acción actual primero.' : `Espera a que ${esc(cur.name)} tire los dados para proponerle un cambio.`}</p>`;
    if (isCur && s.trade) return `<p class="note">Tienes una oferta abierta. Míralo en el panel o retírala para hacer otra.</p>`;
    const tab = isCur ? ui.tradeTab : 'players';
    const tabs = isCur ? `<div class="tabs"><button class="${tab === 'players' ? 'on' : ''}" data-act="ttab" data-t="players">Con jugadores</button><button class="${tab === 'bank' ? 'on' : ''}" data-act="ttab" data-t="bank">Con el banco</button></div>` : '';
    if (tab === 'bank') return tabs + bankHtml(s, vi);
    const nGive = E.total(ui.tGive), nGet = E.total(ui.tGet);
    const ok = nGive && nGet && E.hasRes(p, ui.tGive) && !busy;
    const summary = nGive || nGet ? `<div class="deal"><div><small>Das</small>${miniRes(ui.tGive)}</div><span class="arrow">${I(ICON.swap)}</span><div><small>Pides</small>${miniRes(ui.tGet)}</div></div>` : '';
    const why = !nGive && !nGet ? 'Elige qué das y qué pides.' : !nGive ? 'Elige qué das a cambio.' : !nGet ? 'Elige qué pides.' : '';
    return `${tabs}
      ${isCur ? '<p class="note">Tu oferta les llega a todos. Eliges con quién cambiar entre los que acepten.</p>' : `<p class="note">Fuera de tu turno solo puedes proponer a <b>${esc(cur.name)}</b>, que está en turno.${s.bids && s.bids[vi] ? ' Esta propuesta reemplaza a la anterior.' : ''}</p>`}
      ${quickAsk(p)}
      ${tradeTable(p)}
      ${summary}
      <div class="row"><button class="btn primary big" data-act="${isCur ? 'offerGo' : 'bidGo'}" ${ok ? '' : 'disabled'} style="flex:1;width:auto">${isCur ? 'Ofrecer a todos' : `Proponer a ${esc(cur.name)}`}</button>${nGive || nGet ? '<button class="btn ghost" data-act="tclear">Borrar</button>' : ''}</div>
      ${why ? `<p class="note">${why}</p>` : ''}`;
  }

  function bankHtml(s, vi) {
    const p = s.players[vi];
    const rt = E.ratios(s, vi);
    const g = ui.bankGive, w = ui.bankGet;
    const giveRow = RES.map((r) => {
      const can = p.res[r] >= rt[r];
      return `<button class="bres r-${r}${g === r ? ' sel' : ''}" data-act="bgive" data-r="${r}" ${can ? '' : 'disabled'} aria-pressed="${g === r}">${B.resIcon(r, 22)}<b>${rt[r]}:1</b><small>tienes ${p.res[r]}</small></button>`;
    }).join('');
    const getRow = RES.map((r) => {
      const can = s.bank[r] > 0 && r !== g;
      return `<button class="bres r-${r}${w === r ? ' sel' : ''}" data-act="bget" data-r="${r}" ${can ? '' : 'disabled'} aria-pressed="${w === r}">${B.resIcon(r, 22)}<b>${E.RES_NAME[r]}</b><small>banco ${s.bank[r]}</small></button>`;
    }).join('');
    const ok = g && w && g !== w && p.res[g] >= rt[g] && s.bank[w] > 0 && !busy;
    const anyGive = RES.some((r) => p.res[r] >= rt[r]);
    return `<div class="label">1. Elige qué entregas</div><div class="bgrid">${giveRow}</div>
      ${anyGive ? '' : '<p class="note">Aún no tienes suficientes cartas iguales. Necesitas 4 iguales (o menos con un puerto).</p>'}
      <div class="label">2. Elige qué recibes</div><div class="bgrid">${getRow}</div>
      <button class="btn primary big" data-act="bankGo" ${ok ? '' : 'disabled'}>${g && w ? `Cambiar ${rt[g]} ${E.RES_NAME[g]} por 1 ${E.RES_NAME[w]}` : 'Cambiar con el banco'}</button>
      <p class="note">Tus tasas mejoran con un poblado o ciudad en un puerto: 3:1 en los puertos «?», 2:1 en los de un recurso.</p>`;
  }

  function devUI(s, vi) {
    const p = s.players[vi];
    const canPlay = s.turn.cur === vi && s.phase === 'main' && ['roll', 'main'].includes(s.turn.step) && !s.turn.devPlayed && !busy;
    const groups = {};
    p.dev.forEach((d) => { (groups[d.t] = groups[d.t] || { n: 0, ready: 0 }).n++; if (d.turn < s.turnNo) groups[d.t].ready++; });
    return `<div class="label"><span>Cartas de desarrollo</span>${s.turn.devPlayed && s.turn.cur === vi ? '<span>ya jugaste una este turno</span>' : ''}</div><div class="list">${Object.entries(groups).map(([t, g]) => `<div class="dev"><div class="grow"><b>${E.DEV_NAME[t]}${g.n > 1 ? ' ×' + g.n : ''}</b><span>${E.DEV_HELP[t]}${t !== 'vp' && !g.ready ? ' Podrás jugarla desde tu próximo turno.' : ''}</span></div>
      ${t !== 'vp' ? `<button class="btn small primary" data-act="dev" data-card="${t}" ${canPlay && g.ready ? '' : 'disabled'}>Jugar</button>` : ''}</div>`).join('')}</div>`;
  }

  function winOverlay(s) {
    if (s.phase !== 'ended' || ui.closedOver === session.code) return '';
    const w = s.players[s.winner];
    const res = s.rating;
    const order = s.players.map((p, i) => i).sort((a, b) => (res ? res[a].place - res[b].place : (b === s.winner) - (a === s.winner) || E.victoryPoints(s, b, true) - E.victoryPoints(s, a, true)));
    const rows = order.map((i) => {
      const p = s.players[i], r = res && res[i];
      return `<div class="li${p.id === myId ? ' me' : ''}"><span class="place p${r ? r.place : ''}">${r ? placeTxt(r.place) : ''}</span>${avatar(p, 26)}<span class="grow"><b>${esc(p.name)}</b><small>${E.victoryPoints(s, i, true)} puntos${p.out ? ' · abandonó' : ''}</small></span>${r ? `<span class="elo">${r.after}</span>${delta(r.delta)}` : ''}</div>`;
    }).join('');
    return `<div class="overlay"><div class="card"><svg width="60" height="60" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5" fill="${pColor(w)}"/></svg><h2>${esc(w.name)} gana</h2><p>${E.victoryPoints(s, s.winner, true)} puntos en ${s.turnNo} turnos.</p>
      <div class="list results">${rows}</div>${res ? '' : '<p class="note">Calculando el rating…</p>'}
      <div class="row"><button class="btn" data-act="closeOver">Ver el mapa</button><button class="btn primary" data-act="exit">Volver al inicio</button></div></div></div>`;
  }

  // ---------- Events ----------
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'authName') ui.authName = el.value;
    else if (el.id === 'authPass') ui.authPass = el.value;
    else if (el.id === 'authPass2') ui.authPass2 = el.value;
    else if (el.id === 'joinCode') ui.joinCode = el.value.toUpperCase();
  });
  document.addEventListener('submit', (ev) => {
    if (ev.target.dataset.form === 'auth') { ev.preventDefault(); submitAuth(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'joinCode') joinOnline(ui.joinCode);
  });
  document.addEventListener('toggle', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('logcard')) {
      ui.logOpen = ev.target.open;
      const lg = document.getElementById('log');
      if (lg) lg.scrollTop = lg.scrollHeight;
    }
  }, true);

  function fillAsk(s, vi, m) {
    const cost = { road: E.COST.road, settle: E.COST.settlement, city: E.COST.city, dev: E.COST.dev }[m];
    const p = s.players[vi];
    ui.tGet = missingRes(p, cost);
    // Never offer what the build itself needs.
    RES.forEach((r) => { if (ui.tGet[r] || (ui.tGive[r] && p.res[r] - ui.tGive[r] < (cost[r] || 0))) delete ui.tGive[r]; });
    // In your turn, point the bank at the first missing resource too.
    const first = RES.find((r) => ui.tGet[r]);
    if (first) { ui.bankGet = first; if (ui.bankGive === first) ui.bankGive = null; }
  }

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    // Clicks inside a sheet don't close it.
    if (el.dataset.act === 'closeModal' && el.classList.contains('sheet-back') && ev.target.closest('[data-stop]')) return;
    const d = el.dataset;
    const s = session && session.state;
    const vi = s ? viewerIdx(s) : -1;
    const me = vi >= 0 ? s.players[vi] : null;
    switch (d.act) {
      case 'noop': break;
      case 'exit': leaveSession(); break;
      case 'rules': openModal('rules'); break;
      case 'ranking': openModal('ranking'); break;
      case 'profile': openModal('profile'); break;
      case 'closeModal': closeModal(); break;
      case 'logout': signOut(false); break;
      case 'authTab': ui.authTab = d.t; render(); break;
      case 'create': createOnline(); break;
      case 'join': joinOnline(d.code); break;
      case 'joinCode': joinOnline(ui.joinCode); break;
      case 'joinHere': commit({ type: 'join' }); break;
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
      case 'copy': {
        const link = `${location.origin}${location.pathname}#${session.code}`;
        try { await navigator.clipboard.writeText(link); toast('Enlace copiado. Pásalo a tus amigos.'); } catch { toast(`Comparte: ${link}`); }
        break;
      }
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
      case 'disc': {
        const v = Math.max(0, (ui.discard[d.r] || 0) + +d.d);
        ui.discard[d.r] = Math.min(v, me.res[d.r]);
        render();
        break;
      }
      case 'discardGo': commit({ type: 'discard', res: ui.discard }); break;
      // Trade sheet
      case 'tradeOpen': ui.tradeTab = 'players'; openModal('trade'); break;
      case 'askFor': fillAsk(s, vi, d.m); ui.tradeTab = 'players'; openModal('trade'); break;
      case 'askFill': fillAsk(s, vi, d.m); render(); break;
      case 'ttab': ui.tradeTab = d.t; render(); break;
      case 'tg': {
        const v = Math.min(me.res[d.r], Math.max(0, (ui.tGive[d.r] || 0) + +d.d));
        ui.tGive[d.r] = v;
        if (v) delete ui.tGet[d.r];
        render();
        break;
      }
      case 'tw': {
        const v = Math.min(9, Math.max(0, (ui.tGet[d.r] || 0) + +d.d));
        ui.tGet[d.r] = v;
        if (v) delete ui.tGive[d.r];
        render();
        break;
      }
      case 'tclear': ui.tGive = {}; ui.tGet = {}; render(); break;
      case 'offerGo': await commit({ type: 'offer', give: ui.tGive, get: ui.tGet }); if (session && session.state.trade) closeModal(); break;
      case 'bidGo': commit({ type: 'bid', give: ui.tGive, get: ui.tGet }); break;
      case 'bgive': ui.bankGive = d.r; if (ui.bankGet === d.r) ui.bankGet = null; render(); break;
      case 'bget': ui.bankGet = d.r; render(); break;
      case 'bankGo': commit({ type: 'bankTrade', give: ui.bankGive, get: ui.bankGet }); break;
      case 'respond': commit({ type: 'respond', accept: d.yes === '1' }); break;
      case 'acceptOffer': commit({ type: 'acceptOffer', target: +d.t }); break;
      case 'cancelOffer': commit({ type: 'cancelOffer' }); break;
      case 'withdrawBid': commit({ type: 'withdrawBid' }); break;
      case 'acceptBid': commit({ type: 'acceptBid', target: +d.t }); break;
      case 'rejectBid': commit({ type: 'rejectBid', target: +d.t }); break;
      case 'counter': ui.tGive = { ...s.trade.get }; ui.tGet = { ...s.trade.give }; openModal('trade'); break;
      // Leaving
      case 'resignAsk': ui.confirmResign = true; render(); break;
      case 'resignNo': ui.confirmResign = false; render(); break;
      case 'resignGo': commit({ type: 'resign' }); break;
      case 'claimIdle': commit({ type: 'claimIdle', target: +d.t }); break;
      case 'closeOver': ui.closedOver = session.code; render(); break;
    }
  });

  render();
})();
