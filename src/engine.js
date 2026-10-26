// Hexalia game engine: pure rules, no DOM. Same code runs in every player's browser.
const Engine = (() => {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const RES_NAME = { wood: 'Madera', brick: 'Arcilla', sheep: 'Lana', wheat: 'Trigo', ore: 'Mineral' };
  const TERRAIN_RES = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore', desert: null };
  const TERRAIN_NAME = { forest: 'Bosque', hills: 'Colinas', pasture: 'Pastos', fields: 'Campos', mountains: 'Montañas', desert: 'Desierto' };
  const COST = {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    dev: { sheep: 1, wheat: 1, ore: 1 },
  };
  const DEV_NAME = { knight: 'Guardián', road: 'Constructores', plenty: 'Cosecha', monopoly: 'Monopolio', vp: 'Monumento' };
  const DEV_HELP = {
    knight: 'Mueve al bandido y roba una carta. Cuenta para la Guardia mayor.',
    road: 'Construye 2 caminos gratis.',
    plenty: 'Toma 2 recursos cualquiera del banco.',
    monopoly: 'Elige un recurso: todos te dan todas sus cartas de ese recurso.',
    vp: '1 punto de victoria. Se mantiene oculta.',
  };
  const PLAYER_COLORS = [
    { name: 'Coral', hex: '#ef6a5b' },
    { name: 'Laguna', hex: '#38b6d8' },
    { name: 'Ámbar', hex: '#f4c045' },
    { name: 'Orquídea', hex: '#b083e6' },
  ];
  const PIECES = { road: 15, settlement: 5, city: 4 };
  const WIN_VP = 10;

  class RuleError extends Error {}
  const fail = (msg) => { throw new RuleError(msg); };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- Geometry (fixed 19-hex island, pointy-top, unit size) ----------
  const G = (() => {
    const hexes = [];
    for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) hexes.push({ q, r });
    const SQ = Math.sqrt(3);
    const vMap = new Map(), eMap = new Map(), vertices = [], edges = [];
    hexes.forEach((h, hi) => {
      h.x = SQ * (h.q + h.r / 2);
      h.y = 1.5 * h.r;
      h.corners = [];
      h.edges = [];
      for (let i = 0; i < 6; i++) {
        const a = ((60 * i - 30) * Math.PI) / 180;
        const x = h.x + Math.cos(a), y = h.y + Math.sin(a);
        const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
        let vi = vMap.get(key);
        if (vi === undefined) {
          vi = vertices.length;
          vertices.push({ x, y, hexes: [], adj: [], edges: [] });
          vMap.set(key, vi);
        }
        vertices[vi].hexes.push(hi);
        h.corners.push(vi);
      }
      for (let i = 0; i < 6; i++) {
        const a = Math.min(h.corners[i], h.corners[(i + 1) % 6]);
        const b = Math.max(h.corners[i], h.corners[(i + 1) % 6]);
        const key = `${a}-${b}`;
        let ei = eMap.get(key);
        if (ei === undefined) {
          ei = edges.length;
          edges.push({ a, b, hexes: [] });
          eMap.set(key, ei);
          vertices[a].adj.push(b);
          vertices[b].adj.push(a);
          vertices[a].edges.push(ei);
          vertices[b].edges.push(ei);
        }
        edges[ei].hexes.push(hi);
        h.edges.push(ei);
      }
    });
    hexes.forEach((h) => {
      h.nb = [];
      hexes.forEach((o, oi) => {
        const dq = h.q - o.q, dr = h.r - o.r;
        if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1) h.nb.push(oi);
      });
    });
    const mid = (e) => [(vertices[e.a].x + vertices[e.b].x) / 2, (vertices[e.a].y + vertices[e.b].y) / 2];
    const coast = edges.map((_, i) => i).filter((i) => edges[i].hexes.length === 1);
    coast.sort((i, j) => {
      const [xi, yi] = mid(edges[i]), [xj, yj] = mid(edges[j]);
      return Math.atan2(yi, xi) - Math.atan2(yj, xj);
    });
    // 9 harbors spread round the 30 coastal edges (gaps 3,3,4).
    const portEdges = [1, 4, 7, 11, 14, 17, 21, 24, 27].map((i) => coast[i]);
    return { hexes, vertices, edges, portEdges, coast };
  })();

  // ---------- Board generation ----------
  function generateBoard() {
    const terrains = shuffle([
      ...Array(4).fill('forest'), ...Array(4).fill('pasture'), ...Array(4).fill('fields'),
      ...Array(3).fill('hills'), ...Array(3).fill('mountains'), 'desert',
    ]);
    const TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    let nums;
    for (let tries = 0; tries < 5000; tries++) {
      const t = shuffle(TOKENS.slice());
      nums = terrains.map((ter) => (ter === 'desert' ? 0 : t.pop()));
      const hot = (n) => n === 6 || n === 8;
      const bad = G.hexes.some((h, i) => h.nb.some((j) => (hot(nums[i]) && hot(nums[j])) || (nums[i] && nums[i] === nums[j])));
      if (!bad) break;
    }
    const types = shuffle(['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore']);
    return {
      hexes: terrains.map((terrain, i) => ({ terrain, num: nums[i] })),
      ports: G.portEdges.map((edge, i) => ({ edge, type: types[i] })),
      robber: terrains.indexOf('desert'),
    };
  }

  function makeDeck() {
    return shuffle([
      ...Array(14).fill('knight'), ...Array(5).fill('vp'),
      ...Array(2).fill('road'), ...Array(2).fill('plenty'), ...Array(2).fill('monopoly'),
    ]);
  }

  const emptyRes = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

  function makePlayer(id, name, color) {
    return { id, name, color, res: emptyRes(), dev: [], knights: 0, left: { ...PIECES } };
  }

  function newGame(hostId, hostName) {
    const board = generateBoard();
    return {
      v: 1,
      phase: 'lobby',
      hostId,
      players: [makePlayer(hostId, hostName, 0)],
      board,
      buildings: {},
      roads: {},
      bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
      deck: makeDeck(),
      turn: null,
      setup: null,
      discards: null,
      trade: null,
      longest: { holder: -1, len: 0 },
      army: { holder: -1, size: 0 },
      log: [],
      winner: -1,
      turnNo: 0,
      lastRoll: null,
    };
  }

  // ---------- Queries ----------
  const total = (res) => RES.reduce((n, r) => n + (res[r] || 0), 0);
  const hasRes = (p, cost) => RES.every((r) => (p.res[r] || 0) >= (cost[r] || 0));
  const pay = (s, p, cost) => RES.forEach((r) => { p.res[r] -= cost[r] || 0; s.bank[r] += cost[r] || 0; });
  const fmtRes = (res) => RES.filter((r) => res[r]).map((r) => `${res[r]} ${RES_NAME[r]}`).join(', ') || 'nada';

  function log(s, msg) {
    s.log.push(msg);
    if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
  }

  function settlementSpots(s, p, setup) {
    const out = [];
    G.vertices.forEach((v, vi) => {
      if (s.buildings[vi]) return;
      if (v.adj.some((a) => s.buildings[a])) return;
      if (!setup && !v.edges.some((e) => s.roads[e] === p)) return;
      out.push(vi);
    });
    return out;
  }

  function roadSpots(s, p) {
    const out = [];
    if (s.phase === 'setup') {
      const v = s.setup.lastV;
      return G.vertices[v].edges.filter((e) => s.roads[e] === undefined);
    }
    G.edges.forEach((e, ei) => {
      if (s.roads[ei] !== undefined) return;
      const ok = [e.a, e.b].some((v) => {
        const b = s.buildings[v];
        if (b && b.o === p) return true;
        if (b && b.o !== p) return false;
        return G.vertices[v].edges.some((x) => x !== ei && s.roads[x] === p);
      });
      if (ok) out.push(ei);
    });
    return out;
  }

  function citySpots(s, p) {
    return Object.keys(s.buildings).map(Number).filter((v) => s.buildings[v].o === p && s.buildings[v].t === 's');
  }

  function ratios(s, p) {
    const out = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
    s.board.ports.forEach((port) => {
      const e = G.edges[port.edge];
      const own = [e.a, e.b].some((v) => s.buildings[v] && s.buildings[v].o === p);
      if (!own) return;
      if (port.type === 'any') RES.forEach((r) => { out[r] = Math.min(out[r], 3); });
      else out[port.type] = 2;
    });
    return out;
  }

  function stealTargets(s, p) {
    const set = new Set();
    G.hexes[s.board.robber].corners.forEach((v) => {
      const b = s.buildings[v];
      if (b && b.o !== p && total(s.players[b.o].res) > 0) set.add(b.o);
    });
    return [...set];
  }

  function roadLength(s, p) {
    let best = 0;
    const used = new Set();
    const blocked = (v) => s.buildings[v] && s.buildings[v].o !== p;
    function dfs(v, len) {
      if (len > best) best = len;
      if (len > 0 && blocked(v)) return;
      for (const e of G.vertices[v].edges) {
        if (s.roads[e] !== p || used.has(e)) continue;
        used.add(e);
        const ed = G.edges[e];
        dfs(ed.a === v ? ed.b : ed.a, len + 1);
        used.delete(e);
      }
    }
    const starts = new Set();
    Object.keys(s.roads).forEach((e) => {
      if (s.roads[e] === p) { starts.add(G.edges[e].a); starts.add(G.edges[e].b); }
    });
    starts.forEach((v) => dfs(v, 0));
    return best;
  }

  function victoryPoints(s, p, includeHidden) {
    let vp = 0;
    Object.values(s.buildings).forEach((b) => { if (b.o === p) vp += b.t === 'c' ? 2 : 1; });
    if (s.longest.holder === p) vp += 2;
    if (s.army.holder === p) vp += 2;
    if (includeHidden) vp += s.players[p].dev.filter((d) => d.t === 'vp').length;
    return vp;
  }

  function updateLongest(s) {
    const lens = s.players.map((_, i) => roadLength(s, i));
    const max = Math.max(...lens);
    const cur = s.longest.holder;
    if (cur >= 0 && lens[cur] === max && max >= 5) { s.longest.len = max; return; }
    const top = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
    const holder = max >= 5 && top.length === 1 ? top[0] : -1;
    if (holder !== cur) {
      if (holder >= 0) log(s, `${s.players[holder].name} consigue el Camino más largo (${max}).`);
      else log(s, `Nadie tiene el Camino más largo ahora.`);
    }
    s.longest = { holder, len: holder >= 0 ? max : 0 };
  }

  function updateArmy(s, p) {
    const k = s.players[p].knights;
    const need = s.army.holder >= 0 ? s.players[s.army.holder].knights : 2;
    if (s.army.holder !== p && k > need) {
      s.army = { holder: p, size: k };
      log(s, `${s.players[p].name} consigue la Guardia mayor (${k} guardianes).`);
    } else if (s.army.holder === p) s.army.size = k;
  }

  function checkWin(s) {
    if (s.phase !== 'main') return;
    const p = s.turn.cur;
    const vp = victoryPoints(s, p, true);
    if (vp >= WIN_VP) {
      s.phase = 'ended';
      s.winner = p;
      log(s, `🏆 ${s.players[p].name} gana con ${vp} puntos.`);
    }
  }

  function produce(s, roll) {
    const demand = {};
    RES.forEach((r) => { demand[r] = s.players.map(() => 0); });
    s.board.hexes.forEach((h, hi) => {
      if (h.num !== roll || hi === s.board.robber) return;
      const r = TERRAIN_RES[h.terrain];
      G.hexes[hi].corners.forEach((v) => {
        const b = s.buildings[v];
        if (b) demand[r][b.o] += b.t === 'c' ? 2 : 1;
      });
    });
    const got = s.players.map(() => emptyRes());
    RES.forEach((r) => {
      const d = demand[r];
      const need = d.reduce((a, b) => a + b, 0);
      if (!need) return;
      const takers = d.filter((x) => x > 0).length;
      if (s.bank[r] >= need) d.forEach((n, i) => { got[i][r] += n; });
      else if (takers === 1) {
        const i = d.findIndex((x) => x > 0);
        got[i][r] += s.bank[r];
        log(s, `El banco se quedó sin ${RES_NAME[r]}.`);
      } else { log(s, `No hay suficiente ${RES_NAME[r]} en el banco: nadie lo recibe.`); return; }
    });
    got.forEach((g, i) => {
      if (!total(g)) return;
      RES.forEach((r) => { s.players[i].res[r] += g[r]; s.bank[r] -= g[r]; });
      log(s, `${s.players[i].name} recibe ${fmtRes(g)}.`);
    });
  }

  function finishRobber(s) {
    s.turn.step = s.turn.rolled ? 'main' : 'roll';
  }

  function doSteal(s, p, target) {
    const t = s.players[target];
    const pool = [];
    RES.forEach((r) => { for (let i = 0; i < t.res[r]; i++) pool.push(r); });
    if (pool.length) {
      const r = pool[Math.floor(Math.random() * pool.length)];
      t.res[r]--;
      s.players[p].res[r]++;
      s.turn.stolen = { from: target, to: p, r };
      log(s, `${s.players[p].name} roba una carta a ${t.name}.`);
    }
    finishRobber(s);
  }

  function endRoadBuilding(s, p) {
    s.turn.freeRoads = 0;
    s.turn.step = s.turn.rolled ? 'main' : 'roll';
  }

  // ---------- Actions ----------
  const H = {};

  H.join = (s, a, p, id) => {
    if (s.phase !== 'lobby') fail('La partida ya empezó.');
    const name = String(a.name || '').trim().slice(0, 18) || 'Jugador';
    if (p >= 0) { s.players[p].name = name; return; }
    if (s.players.length >= 4) fail('La partida está llena (máximo 4).');
    const used = new Set(s.players.map((x) => x.color));
    const color = [0, 1, 2, 3].find((c) => !used.has(c));
    s.players.push(makePlayer(id, name, color));
    log(s, `${name} se unió.`);
  };

  H.leave = (s, a, p) => {
    if (s.phase !== 'lobby' || p < 0) fail('No puedes salir ahora.');
    const [gone] = s.players.splice(p, 1);
    log(s, `${gone.name} salió.`);
    if (gone.id === s.hostId && s.players.length) s.hostId = s.players[0].id;
  };

  H.color = (s, a, p) => {
    if (s.phase !== 'lobby' || p < 0) fail('No puedes cambiar de color ahora.');
    const c = Number(a.color);
    if (!(c >= 0 && c < 4)) fail('Color no válido.');
    if (s.players.some((x, i) => i !== p && x.color === c)) fail('Ese color ya está ocupado.');
    s.players[p].color = c;
  };

  H.reroll = (s, a, p, id) => {
    if (s.phase !== 'lobby' || id !== s.hostId) fail('Solo el anfitrión puede cambiar el tablero.');
    s.board = generateBoard();
  };

  H.start = (s, a, p, id) => {
    if (s.phase !== 'lobby' || id !== s.hostId) fail('Solo el anfitrión puede empezar.');
    if (s.players.length < 2) fail('Se necesitan al menos 2 jugadores.');
    s.phase = 'order';
    s.order = { contenders: s.players.map((_, i) => i), rolls: {}, dice: {}, round: 1 };
    s.turn = null;
    log(s, 'Cada jugador tira los dados: el número más alto empieza.');
  };

  // Opening roll: highest starts, ties re-roll among the tied players. Seating order is the lobby order.
  H.orderRoll = (s, a, p) => {
    if (s.phase !== 'order') fail('Ya se decidió quién empieza.');
    const o = s.order;
    if (p < 0 || !o.contenders.includes(p)) fail('No te toca tirar ahora.');
    if (o.rolls[p] !== undefined) fail('Ya tiraste.');
    const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    o.rolls[p] = d[0] + d[1];
    o.dice[s.players[p].id] = d;
    log(s, `${s.players[p].name} saca ${d[0] + d[1]} para decidir quién empieza.`);
    if (o.contenders.some((i) => o.rolls[i] === undefined)) return;
    const max = Math.max(...o.contenders.map((i) => o.rolls[i]));
    const top = o.contenders.filter((i) => o.rolls[i] === max);
    if (top.length > 1) {
      log(s, `Empate a ${max} entre ${top.map((i) => s.players[i].name).join(' y ')}: vuelven a tirar.`);
      o.contenders = top;
      top.forEach((i) => { delete o.rolls[i]; });
      o.round++;
      return;
    }
    const first = top[0];
    s.players = [...s.players.slice(first), ...s.players.slice(0, first)];
    const n = s.players.length;
    const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
    s.phase = 'setup';
    s.setup = { order, i: 0, lastV: null };
    s.turn = { cur: 0, step: 'settle', rolled: false, devPlayed: false, freeRoads: 0 };
    log(s, `${s.players[0].name} empieza con ${max}. Orden: ${s.players.map((x) => x.name).join(' → ')}.`);
    log(s, `${s.players[0].name}: coloca tu primer poblado y camino.`);
  };

  function mustBeCur(s, p) {
    if (p < 0 || s.turn.cur !== p) fail('No es tu turno.');
  }

  H.settle = (s, a, p) => {
    const v = Number(a.v);
    if (s.phase === 'setup') {
      mustBeCur(s, p);
      if (s.turn.step !== 'settle') fail('Ahora toca colocar un camino.');
      if (!settlementSpots(s, p, true).includes(v)) fail('No puedes poblar ahí (deja al menos un cruce libre entre poblados).');
      s.buildings[v] = { o: p, t: 's' };
      s.players[p].left.settlement--;
      s.setup.lastV = v;
      if (s.setup.i >= s.players.length) {
        const g = emptyRes();
        G.vertices[v].hexes.forEach((hi) => {
          const r = TERRAIN_RES[s.board.hexes[hi].terrain];
          if (r && s.bank[r] > 0) { g[r]++; s.bank[r]--; s.players[p].res[r]++; }
        });
        log(s, `${s.players[p].name} funda su segundo poblado y recibe ${fmtRes(g)}.`);
      } else log(s, `${s.players[p].name} funda su primer poblado.`);
      s.turn.step = 'road';
      return;
    }
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail('Primero tira los dados.');
    const pl = s.players[p];
    if (!pl.left.settlement) fail('No te quedan poblados (mejora uno a ciudad).');
    if (!hasRes(pl, COST.settlement)) fail('Te faltan recursos: Madera, Arcilla, Lana y Trigo.');
    if (!settlementSpots(s, p, false).includes(v)) fail('Ese cruce no es válido: debe tocar tu camino y estar a 2 tramos de otros poblados.');
    pay(s, pl, COST.settlement);
    s.buildings[v] = { o: p, t: 's' };
    pl.left.settlement--;
    log(s, `${pl.name} construye un poblado.`);
    updateLongest(s);
    checkWin(s);
  };

  H.road = (s, a, p) => {
    const e = Number(a.e);
    if (s.phase === 'setup') {
      mustBeCur(s, p);
      if (s.turn.step !== 'road') fail('Primero coloca un poblado.');
      if (!roadSpots(s, p).includes(e)) fail('El camino debe salir del poblado que acabas de colocar.');
      s.roads[e] = p;
      s.players[p].left.road--;
      s.setup.i++;
      if (s.setup.i >= s.setup.order.length) {
        s.phase = 'main';
        s.turnNo = 1;
        s.turn = { cur: 0, step: 'roll', rolled: false, devPlayed: false, freeRoads: 0 };
        log(s, `Fin de la colocación. Turno de ${s.players[0].name}.`);
      } else {
        s.turn.cur = s.setup.order[s.setup.i];
        s.turn.step = 'settle';
        s.setup.lastV = null;
      }
      return;
    }
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    const pl = s.players[p];
    const free = s.turn.step === 'roadBuilding';
    if (!free && s.turn.step !== 'main') fail('Primero tira los dados.');
    if (!pl.left.road) fail('No te quedan caminos.');
    if (!free && !hasRes(pl, COST.road)) fail('Te falta Madera o Arcilla.');
    if (!roadSpots(s, p).includes(e)) fail('El camino debe conectar con tus caminos o poblados.');
    if (!free) pay(s, pl, COST.road);
    s.roads[e] = p;
    pl.left.road--;
    log(s, `${pl.name} construye un camino${free ? ' gratis' : ''}.`);
    updateLongest(s);
    if (free) {
      s.turn.freeRoads--;
      if (s.turn.freeRoads <= 0 || !pl.left.road || !roadSpots(s, p).length) endRoadBuilding(s, p);
    }
    checkWin(s);
  };

  H.city = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail('Primero tira los dados.');
    const v = Number(a.v);
    const pl = s.players[p];
    if (!pl.left.city) fail('No te quedan ciudades.');
    if (!hasRes(pl, COST.city)) fail('Una ciudad cuesta 2 Trigo y 3 Mineral.');
    if (!citySpots(s, p).includes(v)) fail('Solo puedes mejorar tus propios poblados.');
    pay(s, pl, COST.city);
    s.buildings[v] = { o: p, t: 'c' };
    pl.left.city--;
    pl.left.settlement++;
    log(s, `${pl.name} convierte un poblado en ciudad.`);
    checkWin(s);
  };

  H.roll = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'roll') fail('Ya tiraste los dados.');
    const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const sum = d[0] + d[1];
    s.turn.rolled = true;
    s.turn.stolen = null;
    s.lastRoll = { d, by: p, turnNo: s.turnNo };
    log(s, `${s.players[p].name} saca ${sum} (${d[0]}+${d[1]}).`);
    if (sum === 7) {
      const disc = {};
      s.players.forEach((pl, i) => {
        const n = total(pl.res);
        if (n > 7) disc[i] = Math.floor(n / 2);
      });
      if (Object.keys(disc).length) {
        s.discards = disc;
        s.turn.step = 'discard';
        log(s, `¡7! Quien tenga más de 7 cartas descarta la mitad.`);
      } else {
        s.turn.step = 'robber';
        log(s, `¡7! ${s.players[p].name} mueve al bandido.`);
      }
      return;
    }
    produce(s, sum);
    s.turn.step = 'main';
  };

  H.discard = (s, a, p) => {
    if (s.phase !== 'main' || s.turn.step !== 'discard') fail('No hay descartes pendientes.');
    if (p < 0 || s.discards[p] === undefined) fail('No tienes que descartar.');
    const res = a.res || {};
    const pl = s.players[p];
    if (RES.some((r) => (res[r] || 0) < 0 || (res[r] || 0) > pl.res[r])) fail('No tienes esas cartas.');
    if (total(res) !== s.discards[p]) fail(`Debes descartar exactamente ${s.discards[p]} cartas.`);
    pay(s, pl, res);
    log(s, `${pl.name} descarta ${s.discards[p]} cartas.`);
    delete s.discards[p];
    if (!Object.keys(s.discards).length) {
      s.discards = null;
      s.turn.step = 'robber';
    }
  };

  H.robber = (s, a, p) => {
    if (s.phase !== 'main' || s.turn.step !== 'robber') fail('Ahora no se mueve el bandido.');
    mustBeCur(s, p);
    const h = Number(a.h);
    if (!(h >= 0 && h < 19)) fail('Casilla no válida.');
    if (h === s.board.robber) fail('El bandido debe moverse a otra casilla.');
    s.board.robber = h;
    log(s, `${s.players[p].name} mueve al bandido a ${TERRAIN_NAME[s.board.hexes[h].terrain]}${s.board.hexes[h].num ? ' ' + s.board.hexes[h].num : ''}.`);
    const t = stealTargets(s, p);
    if (!t.length) finishRobber(s);
    else if (t.length === 1) doSteal(s, p, t[0]);
    else s.turn.step = 'steal';
  };

  H.steal = (s, a, p) => {
    if (s.phase !== 'main' || s.turn.step !== 'steal') fail('Ahora no puedes robar.');
    mustBeCur(s, p);
    const t = Number(a.target);
    if (!stealTargets(s, p).includes(t)) fail('No puedes robar a ese jugador.');
    doSteal(s, p, t);
  };

  H.buyDev = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail('Primero tira los dados.');
    const pl = s.players[p];
    if (!s.deck.length) fail('No quedan cartas de desarrollo.');
    if (!hasRes(pl, COST.dev)) fail('Una carta cuesta Lana, Trigo y Mineral.');
    pay(s, pl, COST.dev);
    pl.dev.push({ t: s.deck.pop(), turn: s.turnNo });
    log(s, `${pl.name} compra una carta de desarrollo.`);
    checkWin(s);
  };

  H.playDev = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (!['roll', 'main'].includes(s.turn.step)) fail('Termina la acción actual primero.');
    if (s.turn.devPlayed) fail('Solo puedes jugar una carta de desarrollo por turno.');
    const pl = s.players[p];
    const t = a.card;
    if (t === 'vp') fail('Los Monumentos no se juegan: ya cuentan como punto.');
    const idx = pl.dev.findIndex((d) => d.t === t && d.turn < s.turnNo);
    if (idx < 0) fail(pl.dev.some((d) => d.t === t) ? 'No puedes jugar una carta el mismo turno que la compras.' : 'No tienes esa carta.');
    if (t === 'plenty') {
      const pick = a.res || [];
      if (pick.length !== 2 || pick.some((r) => !RES.includes(r))) fail('Elige 2 recursos.');
      const need = emptyRes();
      pick.forEach((r) => need[r]++);
      if (RES.some((r) => s.bank[r] < need[r])) fail('El banco no tiene esos recursos.');
      RES.forEach((r) => { s.bank[r] -= need[r]; pl.res[r] += need[r]; });
      log(s, `${pl.name} juega Cosecha y toma ${fmtRes(need)}.`);
    } else if (t === 'monopoly') {
      const r = a.res;
      if (!RES.includes(r)) fail('Elige un recurso.');
      let n = 0;
      s.players.forEach((o, i) => { if (i !== p) { n += o.res[r]; o.res[r] = 0; } });
      pl.res[r] += n;
      log(s, `${pl.name} juega Monopolio de ${RES_NAME[r]} y se lleva ${n}.`);
    } else if (t === 'road') {
      if (!pl.left.road || !roadSpots(s, p).length) fail('No tienes dónde construir caminos.');
      s.turn.freeRoads = Math.min(2, pl.left.road);
      s.turn.step = 'roadBuilding';
      log(s, `${pl.name} juega Constructores: 2 caminos gratis.`);
    } else if (t === 'knight') {
      pl.knights++;
      s.turn.step = 'robber';
      log(s, `${pl.name} juega un Guardián.`);
      updateArmy(s, p);
    } else fail('Carta desconocida.');
    pl.dev.splice(idx, 1);
    s.turn.devPlayed = true;
    checkWin(s);
  };

  H.bankTrade = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail('Primero tira los dados.');
    const give = a.give, get = a.get;
    if (!RES.includes(give) || !RES.includes(get) || give === get) fail('Elige qué das y qué recibes.');
    const n = ratios(s, p)[give];
    const pl = s.players[p];
    if (pl.res[give] < n) fail(`Necesitas ${n} de ${RES_NAME[give]}.`);
    if (s.bank[get] < 1) fail(`El banco no tiene ${RES_NAME[get]}.`);
    pl.res[give] -= n; s.bank[give] += n;
    pl.res[get]++; s.bank[get]--;
    log(s, `${pl.name} cambia ${n} ${RES_NAME[give]} por 1 ${RES_NAME[get]} con el banco.`);
  };

  H.offer = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail('Primero tira los dados.');
    const give = emptyRes(), get = emptyRes();
    RES.forEach((r) => { give[r] = Math.max(0, Math.floor(+a.give?.[r] || 0)); get[r] = Math.max(0, Math.floor(+a.get?.[r] || 0)); });
    if (!total(give) || !total(get)) fail('La oferta debe dar y pedir algo.');
    if (!hasRes(s.players[p], give)) fail('No tienes lo que ofreces.');
    s.trade = { give, get, resp: {} };
    log(s, `${s.players[p].name} ofrece ${fmtRes(give)} a cambio de ${fmtRes(get)}.`);
  };

  H.respond = (s, a, p) => {
    if (!s.trade) fail('No hay oferta abierta.');
    if (p < 0 || p === s.turn.cur) fail('No puedes responder a tu propia oferta.');
    const yes = !!a.accept;
    if (yes && !hasRes(s.players[p], s.trade.get)) fail('No tienes lo que piden.');
    s.trade.resp[p] = yes;
  };

  H.acceptOffer = (s, a, p) => {
    mustBeCur(s, p);
    const t = s.trade;
    if (!t) fail('No hay oferta abierta.');
    const o = Number(a.target);
    if (t.resp[o] !== true) fail('Ese jugador no aceptó.');
    const me = s.players[p], other = s.players[o];
    if (!hasRes(me, t.give)) fail('Ya no tienes lo que ofreciste.');
    if (!hasRes(other, t.get)) fail(`${other.name} ya no tiene lo que pediste.`);
    RES.forEach((r) => {
      me.res[r] += t.get[r] - t.give[r];
      other.res[r] += t.give[r] - t.get[r];
    });
    log(s, `${me.name} y ${other.name} intercambian (${fmtRes(t.give)} ⇄ ${fmtRes(t.get)}).`);
    s.trade = null;
  };

  H.cancelOffer = (s, a, p) => {
    mustBeCur(s, p);
    s.trade = null;
  };

  H.endTurn = (s, a, p) => {
    if (s.phase !== 'main') fail('La partida no está en curso.');
    mustBeCur(s, p);
    if (s.turn.step !== 'main') fail(s.turn.step === 'roll' ? 'Primero tira los dados.' : 'Termina la acción actual primero.');
    s.trade = null;
    const n = s.players.length;
    s.turnNo++;
    s.turn = { cur: (p + 1) % n, step: 'roll', rolled: false, devPlayed: false, freeRoads: 0 };
    log(s, `Turno de ${s.players[s.turn.cur].name}.`);
  };

  function apply(state, action, actorId) {
    const s = JSON.parse(JSON.stringify(state));
    const h = H[action && action.type];
    if (!h) return { ok: false, error: 'Acción desconocida.' };
    const p = s.players.findIndex((x) => x.id === actorId);
    try {
      h(s, action, p, actorId);
      return { ok: true, state: s };
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, error: e.message };
      throw e;
    }
  }

  return {
    RES, RES_NAME, TERRAIN_RES, TERRAIN_NAME, COST, DEV_NAME, DEV_HELP, PLAYER_COLORS, PIECES, WIN_VP, G,
    newGame, generateBoard, apply, total, hasRes, ratios, settlementSpots, roadSpots, citySpots, stealTargets,
    roadLength, victoryPoints, fmtRes,
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
