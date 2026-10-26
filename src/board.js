// Hexalia board renderer: a static island layer (terrain, coast, harbors) and a live layer (pieces, robber, targets).
const Board = (() => {
  const E = Engine, G = E.G;
  const S = 56;
  const P = (n) => (n * S).toFixed(1);

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function hexPts(hi, scale = 1) {
    const h = G.hexes[hi];
    return h.corners.map((v) => {
      const x = h.x + (G.vertices[v].x - h.x) * scale, y = h.y + (G.vertices[v].y - h.y) * scale;
      return `${P(x)},${P(y)}`;
    }).join(' ');
  }

  const TERR = {
    forest: ['#57a463', '#1f5c36'],
    pasture: ['#b9e27a', '#78ac46'],
    fields: ['#f7d672', '#d9a535'],
    hills: ['#e28a57', '#a54d27'],
    mountains: ['#b3b8c6', '#646a7e'],
    desert: ['#f0dcaa', '#c9a96f'],
  };

  const RES_ICON = {
    wood: '<path d="M12 2 4.5 13h4L5 18.5h14L15.5 13h4z" fill="currentColor"/><rect x="10.8" y="18" width="2.4" height="4" fill="currentColor"/>',
    brick: '<rect x="2" y="5" width="9" height="6" rx="1" fill="currentColor"/><rect x="13" y="5" width="9" height="6" rx="1" fill="currentColor"/><rect x="7" y="13" width="10" height="6" rx="1" fill="currentColor"/><rect x="2" y="13" width="3.5" height="6" rx="1" fill="currentColor"/><rect x="18.5" y="13" width="3.5" height="6" rx="1" fill="currentColor"/>',
    sheep: '<ellipse cx="11" cy="13" rx="7.5" ry="5.5" fill="currentColor"/><circle cx="19" cy="10" r="3.2" fill="currentColor"/><rect x="7" y="17" width="2.2" height="5" fill="currentColor"/><rect x="13" y="17" width="2.2" height="5" fill="currentColor"/>',
    wheat: '<path d="M12 23V6" stroke="currentColor" stroke-width="2"/><ellipse cx="8.6" cy="9" rx="2.2" ry="3.8" fill="currentColor"/><ellipse cx="15.4" cy="9" rx="2.2" ry="3.8" fill="currentColor"/><ellipse cx="8.6" cy="15.5" rx="2.2" ry="3.8" fill="currentColor"/><ellipse cx="15.4" cy="15.5" rx="2.2" ry="3.8" fill="currentColor"/><ellipse cx="12" cy="3.6" rx="2" ry="3.2" fill="currentColor"/>',
    ore: '<path d="M1.5 21 8.5 7l4.2 6.5L16 9l6.5 12z" fill="currentColor"/><path d="M8.5 7l2 3.2-2 1.2-2-1.1z" fill="#fff" opacity=".7"/>',
    any: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9.2 9.3a2.9 2.9 0 1 1 4 2.7c-.8.4-1.2 1-1.2 1.9v.6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.4" fill="currentColor"/>',
  };
  const resIcon = (r, size = 22, extra = '') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${extra}>${RES_ICON[r]}</svg>`;
  const RES_COLOR = { wood: '#2f8a4e', brick: '#cf6a3d', sheep: '#86b94c', wheat: '#e0aa31', ore: '#737b92', any: '#3c4a52' };

  function defs() {
    const grads = Object.entries(TERR).map(([k, [a, b]]) => `<radialGradient id="g-${k}" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join('');
    return `<defs>${grads}
      <radialGradient id="g-token" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e2d2ab"/></radialGradient>
      <radialGradient id="g-sand" cx="50%" cy="50%" r="60%"><stop offset=".7" stop-color="#e8d49c"/><stop offset="1" stop-color="#c8ad6d"/></radialGradient>
      <linearGradient id="g-stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d7180"/><stop offset="1" stop-color="#2b2d36"/></linearGradient>
      <pattern id="p-rows" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="9" height="3.6" fill="#b98419" opacity=".35"/></pattern>
      <pattern id="p-waves" width="90" height="60" patternUnits="userSpaceOnUse"><path d="M6 20q8 -7 16 0t16 0M50 48q8 -7 16 0t16 0" stroke="#7cc6dd" stroke-width="1.6" fill="none" opacity=".35"/></pattern>
      <filter id="f-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000" flood-opacity=".5"/></filter>
      <filter id="f-soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#021018" flood-opacity=".55"/></filter>
      <filter id="f-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    </defs>`;
  }

  // ----- terrain art -----
  const tree = (x, y, s = 1) => `<ellipse cx="${x + 3}" cy="${y + 8 * s}" rx="${7 * s}" ry="${2.4 * s}" fill="rgba(0,0,0,.28)"/><rect x="${x - 1.3}" y="${y + 3 * s}" width="2.6" height="${5 * s}" fill="#4a3320"/><path d="M${x} ${y - 15 * s}L${x - 8.5 * s} ${y + 4 * s}H${x + 8.5 * s}Z" fill="#1a5130"/><path d="M${x} ${y - 15 * s}L${x + 8.5 * s} ${y + 4 * s}H${x}Z" fill="#2f7e48"/><path d="M${x} ${y - 19 * s}L${x - 6 * s} ${y - 6 * s}H${x + 6 * s}Z" fill="#1f5c37"/><path d="M${x} ${y - 19 * s}L${x + 6 * s} ${y - 6 * s}H${x}Z" fill="#3a9157"/>`;
  const sheep = (x, y) => `<ellipse cx="${x + 2}" cy="${y + 6}" rx="8" ry="2.2" fill="rgba(0,0,0,.22)"/><rect x="${x - 4}" y="${y + 1}" width="1.8" height="5" fill="#3b3a35"/><rect x="${x + 2.5}" y="${y + 1}" width="1.8" height="5" fill="#3b3a35"/><ellipse cx="${x}" cy="${y - 1}" rx="7.5" ry="5.2" fill="#fbfaf2"/><ellipse cx="${x + 1.5}" cy="${y + 1}" rx="5" ry="2.6" fill="#e1dfd2"/><ellipse cx="${x + 7.5}" cy="${y - 3}" rx="2.8" ry="2.4" fill="#3b3a35"/>`;
  const tuft = (x, y) => `<path d="M${x - 3} ${y}l1.5-4M${x} ${y}v-5M${x + 3} ${y}l-1.5-4" stroke="#5c9136" stroke-width="1.4" stroke-linecap="round"/>`;
  const sheaf = (x, y) => `<ellipse cx="${x + 2}" cy="${y + 8}" rx="6" ry="2" fill="rgba(0,0,0,.2)"/><path d="M${x - 5} ${y + 7}L${x} ${y - 9}L${x + 5} ${y + 7}Z" fill="#c8901f"/><path d="M${x} ${y - 9}L${x + 5} ${y + 7}H${x}Z" fill="#e8b440"/><rect x="${x - 4}" y="${y}" width="8" height="2" fill="#8a5d12"/>`;
  const peak = (x, y, s = 1) => `<path d="M${x - 17 * s} ${y + 10 * s}L${x} ${y - 16 * s}L${x + 17 * s} ${y + 10 * s}Z" fill="#555b6d"/><path d="M${x} ${y - 16 * s}L${x + 17 * s} ${y + 10 * s}H${x + 2 * s}Z" fill="#3e4352"/><path d="M${x} ${y - 16 * s}L${x - 6 * s} ${y - 6.5 * s}l3 1.6 3-2.6 3 2.4 3-1.2Z" fill="#f5f7fb"/>`;
  const mound = (x, y) => `<path d="M${x - 14} ${y + 6}q14 -18 28 0z" fill="#9c4622"/><path d="M${x} ${y - 3}q7 2 14 9h-14z" fill="#7f3518" opacity=".7"/>`;
  const bricks = (x, y) => `<g><rect x="${x - 8}" y="${y - 2}" width="7" height="4" fill="#b2502a" stroke="#6d2c12" stroke-width=".8"/><rect x="${x}" y="${y - 2}" width="7" height="4" fill="#c25e34" stroke="#6d2c12" stroke-width=".8"/><rect x="${x - 4}" y="${y - 6}" width="7" height="4" fill="#d1693c" stroke="#6d2c12" stroke-width=".8"/></g>`;

  function art(terrain, cx, cy, hi) {
    const j = (i) => ((hi * 7 + i * 13) % 5) - 2;
    const at = (pts, f) => pts.map(([x, y], i) => f(cx + x + j(i), cy + y + j(i + 2))).join('');
    switch (terrain) {
      case 'forest': return at([[-22, -20], [0, -28], [22, -18], [-31, 4], [31, 6], [-20, 28], [20, 30], [0, 34]], (x, y) => tree(x, y, 0.95));
      case 'pasture': return at([[-28, -14], [26, 20], [-12, 34], [30, -18], [6, -36], [-34, 12], [14, 36]], tuft) + at([[-14, -26], [24, -6], [-24, 20]], sheep);
      case 'fields': return `<polygon points="${hexPts(hi, 0.9)}" fill="url(#p-rows)"/>` + at([[-24, -20], [24, -20], [-28, 18], [26, 20]], sheaf);
      case 'hills': return at([[-20, -20], [20, -22], [-28, 16], [24, 22]], mound) + at([[0, -34], [0, 36]], bricks);
      case 'mountains': return peak(cx - 18, cy - 18, 1) + peak(cx + 18, cy - 20, 0.9) + peak(cx - 22, cy + 22, 0.8) + peak(cx + 22, cy + 24, 0.85);
      case 'desert': return `<path d="M${cx - 38} ${cy + 26}q16 -14 34 0t34 0" fill="#d8bd82"/><path d="M${cx - 30} ${cy - 22}q14 -12 28 0t28 0" fill="#ddc48d"/><path d="M${cx + 26} ${cy + 10}v-18m0 7h-6v-6m6 10h6v-8" stroke="#5c8a46" stroke-width="3.6" stroke-linecap="round" fill="none"/><ellipse cx="${cx - 26}" cy="${cy + 2}" rx="5" ry="3.4" fill="#a99069"/>`;
    }
    return '';
  }

  function staticLayer(s) {
    const b = s.board;
    const out = [];
    out.push(`<rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#p-waves)"/>`);
    // shallow water + beach
    out.push(`<g filter="url(#f-soft)">${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 1.2)}" fill="#3aa2c2" opacity=".5"/>`).join('')}</g>`);
    out.push(`<g>${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 1.09)}" fill="url(#g-sand)" stroke="#e8d49c" stroke-width="2" stroke-linejoin="round"/>`).join('')}</g>`);
    // harbors (piers sit on the beach, labels in the sea)
    b.ports.forEach((port) => {
      const e = G.edges[port.edge];
      const va = G.vertices[e.a], vb = G.vertices[e.b];
      const h = G.hexes[e.hexes[0]];
      const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
      const dx = mx - h.x, dy = my - h.y, len = Math.hypot(dx, dy);
      const px = mx + (dx / len) * 0.66, py = my + (dy / len) * 0.66;
      const X = px * S, Y = py * S;
      [va, vb].forEach((v) => {
        out.push(`<line x1="${P(v.x)}" y1="${P(v.y)}" x2="${P(px)}" y2="${P(py)}" stroke="#4a2f17" stroke-width="8" stroke-linecap="round"/>`);
        out.push(`<line x1="${P(v.x)}" y1="${P(v.y)}" x2="${P(px)}" y2="${P(py)}" stroke="#a87a48" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 2"/>`);
      });
      const col = RES_COLOR[port.type];
      const name = port.type === 'any' ? 'Puerto 3:1: cambia 3 iguales por 1' : `Puerto 2:1 de ${E.RES_NAME[port.type]}`;
      out.push(`<g filter="url(#f-shadow)"><circle cx="${X}" cy="${Y}" r="22" fill="#fbf5e6" stroke="${col}" stroke-width="4"/></g>`);
      out.push(`<svg x="${X - 9}" y="${Y - 17}" width="18" height="18" viewBox="0 0 24 24" style="color:${col}" aria-hidden="true">${RES_ICON[port.type]}</svg>`);
      out.push(`<text x="${X}" y="${Y + 14}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="900" font-size="11.5" fill="#1d2629">${port.type === 'any' ? '3:1' : '2:1'}</text>`);
      out.push(`<title>${name}</title>`);
    });
    // terrain tiles
    out.push(`<g filter="url(#f-shadow)">${b.hexes.map((hx, hi) => `<polygon points="${hexPts(hi, 0.975)}" fill="url(#g-${hx.terrain})" stroke="rgba(30,20,10,.45)" stroke-width="2" stroke-linejoin="round"/>`).join('')}</g>`);
    out.push(`<g filter="url(#f-grain)" opacity=".18" style="mix-blend-mode:multiply">${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 0.975)}" fill="#000"/>`).join('')}</g>`);
    b.hexes.forEach((hx, hi) => {
      const h = G.hexes[hi];
      const cx = h.x * S, cy = h.y * S;
      out.push(`<polygon points="${hexPts(hi, 0.92)}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>`);
      out.push(art(hx.terrain, cx, cy, hi));
      out.push(`<title>${E.TERRAIN_NAME[hx.terrain]}${hx.num ? ' · ' + hx.num : ''}${E.TERRAIN_RES[hx.terrain] ? ' · produce ' + E.RES_NAME[E.TERRAIN_RES[hx.terrain]] : ''}</title>`);
      if (hx.num) {
        const hot = hx.num === 6 || hx.num === 8;
        const pips = 6 - Math.abs(7 - hx.num);
        const ink = hot ? '#b8321f' : '#26231d';
        out.push(`<g filter="url(#f-shadow)"><circle cx="${cx}" cy="${cy}" r="19" fill="url(#g-token)" stroke="#a89466" stroke-width="1.2"/></g>`);
        out.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="900" font-size="${hot ? 20 : 18}" fill="${ink}">${hx.num}</text>`);
        for (let i = 0; i < pips; i++) out.push(`<circle cx="${(cx + (i - (pips - 1) / 2) * 4.2).toFixed(1)}" cy="${cy + 12}" r="1.5" fill="${ink}"/>`);
      }
    });
    return out.join('');
  }

  function settlementShape(x, y, c) {
    return `<g filter="url(#f-shadow)"><path d="M${x - 9} ${y + 8}H${x + 3}V${y - 1}L${x - 3} ${y - 8}L${x - 9} ${y - 1}Z" fill="${c}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${x + 3} ${y + 8}L${x + 10} ${y + 4}V${y - 5}L${x + 3} ${y - 1}Z" fill="${shade(c, -0.32)}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${x - 3} ${y - 8}L${x + 4} ${y - 12}L${x + 10} ${y - 5}L${x + 3} ${y - 1}Z" fill="${shade(c, -0.18)}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="${x - 5}" y="${y + 2}" width="3" height="6" fill="${shade(c, -0.55)}"/></g>`;
  }
  function cityShape(x, y, c) {
    return `<g filter="url(#f-shadow)"><path d="M${x - 14} ${y + 9}H${x + 4}V${y - 2}H${x - 3}V${y - 8}L${x - 8.5} ${y - 14}L${x - 14} ${y - 8}Z" fill="${c}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${x + 4} ${y + 9}L${x + 13} ${y + 4}V${y - 6}L${x + 4} ${y - 2}Z" fill="${shade(c, -0.32)}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${x - 3} ${y - 2}L${x + 6} ${y - 7}L${x + 13} ${y - 6}L${x + 4} ${y - 2}Z" fill="${shade(c, -0.15)}" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${x - 8.5} ${y - 14}L${x - 3} ${y - 8}V${y - 2}" fill="none" stroke="#0b1418" stroke-width="1"/>
      <rect x="${x - 11}" y="${y + 1}" width="3" height="4" fill="${shade(c, -0.55)}"/><rect x="${x - 4}" y="${y + 1}" width="3" height="4" fill="${shade(c, -0.55)}"/><rect x="${x - 10}" y="${y - 7}" width="3" height="3" fill="${shade(c, -0.55)}"/></g>`;
  }

  function liveLayer(s, t, colorOf) {
    const out = [];
    const b = s.board;
    const roll = s.lastRoll && s.phase === 'main' ? s.lastRoll.d[0] + s.lastRoll.d[1] : 0;
    b.hexes.forEach((hx, hi) => { if (roll && hx.num === roll && hi !== b.robber) out.push(`<polygon class="hot-hex" points="${hexPts(hi, 0.96)}"/>`); });
    // robber
    {
      const h = G.hexes[b.robber];
      const cx = h.x * S, cy = h.y * S;
      out.push(`<polygon points="${hexPts(b.robber, 0.975)}" fill="rgba(4,10,14,.3)" pointer-events="none"/>`);
      const rx = cx + 24, ry = cy - 4;
      out.push(`<g pointer-events="none" filter="url(#f-shadow)"><ellipse cx="${rx}" cy="${ry + 19}" rx="11" ry="3.5" fill="rgba(0,0,0,.4)"/><path d="M${rx - 10} ${ry + 18}q-1 -14 5 -19q-4 -4 -2 -9q7 -6 14 0q2 5 -2 9q6 5 5 19z" fill="url(#g-stone)" stroke="#121318" stroke-width="1.4"/><ellipse cx="${rx - 2}" cy="${ry - 12}" rx="2.5" ry="1.5" fill="#fff" opacity=".35"/></g>`);
      out.push(`<title>Bandido: esta casilla no produce</title>`);
    }
    // roads
    Object.entries(s.roads).forEach(([e, o]) => {
      const ed = G.edges[e], va = G.vertices[ed.a], vb = G.vertices[ed.b];
      const x1 = va.x * S, y1 = va.y * S, x2 = vb.x * S, y2 = vb.y * S;
      const sx = x1 + (x2 - x1) * 0.17, sy = y1 + (y2 - y1) * 0.17, ex = x1 + (x2 - x1) * 0.83, ey = y1 + (y2 - y1) * 0.83;
      const c = colorOf(o);
      out.push(`<line x1="${sx}" y1="${sy + 2}" x2="${ex}" y2="${ey + 2}" stroke="rgba(0,0,0,.4)" stroke-width="11" stroke-linecap="round"/>`);
      out.push(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#0b1418" stroke-width="11" stroke-linecap="round"/>`);
      out.push(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${shade(c, -0.25)}" stroke-width="8" stroke-linecap="round"/>`);
      out.push(`<line x1="${sx}" y1="${sy - 1.5}" x2="${ex}" y2="${ey - 1.5}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`);
    });
    // buildings
    Object.entries(s.buildings).forEach(([v, bd]) => {
      const x = G.vertices[v].x * S, y = G.vertices[v].y * S;
      out.push(bd.t === 's' ? settlementShape(x, y, colorOf(bd.o)) : cityShape(x, y, colorOf(bd.o)));
    });
    // targets
    t.hexes.forEach((hi) => out.push(`<polygon class="hex-target" data-act="hex" data-h="${hi}" points="${hexPts(hi, 0.95)}"><title>Mover el bandido aquí</title></polygon>`));
    t.edges.forEach((e) => {
      const ed = G.edges[e], va = G.vertices[ed.a], vb = G.vertices[ed.b];
      const x1 = va.x * S, y1 = va.y * S, x2 = vb.x * S, y2 = vb.y * S;
      out.push(`<line class="edge-hit" data-act="edge" data-e="${e}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><title>Construir camino aquí</title></line>`);
      out.push(`<line class="edge-glow" x1="${x1 + (x2 - x1) * 0.2}" y1="${y1 + (y2 - y1) * 0.2}" x2="${x1 + (x2 - x1) * 0.8}" y2="${y1 + (y2 - y1) * 0.8}"/>`);
    });
    t.verts.forEach((v) => out.push(`<g class="spot" data-act="vert" data-v="${v}"><circle class="ring" cx="${G.vertices[v].x * S}" cy="${G.vertices[v].y * S}" r="11"/><circle cx="${G.vertices[v].x * S}" cy="${G.vertices[v].y * S}" r="18" fill="transparent"/><title>Construir poblado aquí</title></g>`));
    t.cities.forEach((v) => out.push(`<circle class="city-target" data-act="cityv" data-v="${v}" cx="${G.vertices[v].x * S}" cy="${G.vertices[v].y * S}" r="18"><title>Mejorar a ciudad</title></circle>`));
    return out.join('');
  }

  const VIEWBOX = '-300 -282 600 564';

  return { S, defs, staticLayer, liveLayer, resIcon, RES_COLOR, shade, VIEWBOX, settlementShape, cityShape };
})();
