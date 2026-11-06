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

  // Flat cartoon tiles: [face, rim, highlight].
  const TERR = {
    forest: ['#3aa543', '#1f7a2c', '#63c46b'],
    pasture: ['#a6d846', '#76a826', '#c6ec74'],
    fields: ['#f6c935', '#d09612', '#ffe27a'],
    hills: ['#ec7b3d', '#b44d1d', '#f9a06a'],
    mountains: ['#b3b7be', '#7a7f88', '#d6d9dd'],
    desert: ['#e6d9a4', '#b8a867', '#f3ebc6'],
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
    return `<defs>
      <pattern id="p-waves" width="120" height="80" patternUnits="userSpaceOnUse"><path d="M10 24q10 -8 20 0t20 0M66 62q10 -8 20 0t20 0" stroke="#5aa6e0" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/></pattern>
      <filter id="f-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.6" flood-color="#0b2a44" flood-opacity=".45"/></filter>
      <filter id="f-soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0b2a44" flood-opacity=".35"/></filter>
    </defs>`;
  }

  // ----- terrain art: one big centered icon per tile, like a board-game illustration -----
  const OUT = 'stroke="#2b2b2b" stroke-opacity=".28" stroke-width="1.2" stroke-linejoin="round"';
  const tuft = (x, y, c) => `<path d="M${x - 4} ${y}l1.6-5M${x} ${y}v-6M${x + 4} ${y}l-1.6-5" stroke="${c}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
  const pine = (x, y, s = 1) => `<g ${OUT}><rect x="${x - 2.2 * s}" y="${y + 9 * s}" width="${4.4 * s}" height="${6 * s}" fill="#7a4a22"/>
    <path d="M${x} ${y - 22 * s}L${x - 15 * s} ${y + 10 * s}H${x + 15 * s}Z" fill="#1d7a33"/><path d="M${x} ${y - 22 * s}L${x + 15 * s} ${y + 10 * s}H${x}Z" fill="#16652a"/>
    <path d="M${x} ${y - 26 * s}L${x - 10 * s} ${y - 4 * s}H${x + 10 * s}Z" fill="#279a42"/><path d="M${x} ${y - 26 * s}L${x + 10 * s} ${y - 4 * s}H${x}Z" fill="#1e8137"/></g>`;
  const sheepIcon = (x, y) => `<g ${OUT}><rect x="${x - 8}" y="${y + 4}" width="3" height="8" rx="1" fill="#3a3a3a"/><rect x="${x + 4}" y="${y + 4}" width="3" height="8" rx="1" fill="#3a3a3a"/>
    <path d="M${x - 14} ${y + 2}c-4 -4 -1 -10 4 -9c1 -5 8 -6 11 -2c4 -3 10 -1 10 4c5 1 5 8 1 10c0 4 -6 6 -9 3c-3 3 -10 3 -12 0c-4 1 -8 -2 -5 -6z" fill="#ffffff"/>
    <ellipse cx="${x + 15}" cy="${y - 4}" rx="5.5" ry="4.5" fill="#3a3a3a"/><ellipse cx="${x + 12}" cy="${y - 8}" rx="2.4" ry="1.3" fill="#3a3a3a"/><circle cx="${x + 16.5}" cy="${y - 5}" r="1" fill="#fff"/></g>`;
  const wheatIcon = (x, y) => {
    let g = `<path d="M${x} ${y + 16}V${y - 14}" stroke="#a87412" stroke-width="2.4" stroke-linecap="round"/><path d="M${x} ${y + 12}q-9 -8 -12 -20M${x} ${y + 12}q9 -8 12 -20" stroke="#a87412" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    const grain = (gx, gy, rot) => `<ellipse cx="${gx}" cy="${gy}" rx="2.6" ry="4.6" transform="rotate(${rot} ${gx} ${gy})" fill="#fbe08a" stroke="#b07b10" stroke-width="1"/>`;
    for (let i = 0; i < 4; i++) { g += grain(x - 3.2, y - 10 + i * 6, -25) + grain(x + 3.2, y - 10 + i * 6, 25); }
    g += grain(x, y - 16, 0) + grain(x - 12, y - 10, -30) + grain(x + 12, y - 10, 30);
    return `<g>${g}</g>`;
  };
  const brickIcon = (x, y) => {
    const br = (bx, by, w) => `<rect x="${bx}" y="${by}" width="${w}" height="7" rx="1.5" fill="#fbd6bf" stroke="#b24f22" stroke-width="1.2"/>`;
    return `<g>${br(x - 19, y - 2, 12)}${br(x - 6, y - 2, 12)}${br(x + 7, y - 2, 12)}${br(x - 13, y - 10, 12)}${br(x, y - 10, 12)}${br(x - 6, y - 18, 12)}</g>`;
  };
  const rockIcon = (x, y) => `<g ${OUT}><path d="M${x - 20} ${y + 6}q-2 -10 8 -12q6 -6 13 0q4 8 -2 12z" fill="#f2f3f5"/><path d="M${x - 4} ${y + 6}q-1 -13 10 -14q9 1 9 9q1 5 -4 5z" fill="#e2e4e8"/><path d="M${x - 9} ${y - 7}q2 -9 10 -8q7 2 5 8z" fill="#fafafa"/>
    <path d="M${x - 14} ${y + 1}h6M${x + 4} ${y - 1}h7" stroke="#b6b9c0" stroke-width="1.4" stroke-linecap="round"/></g>`;
  const cactus = (x, y) => `<g ${OUT}><path d="M${x - 3.5} ${y + 18}V${y - 14}a3.5 3.5 0 0 1 7 0V${y + 18}z" fill="#5f9b4a"/><path d="M${x - 3.5} ${y + 2}h-6a3 3 0 0 1 -3 -3v-7a3 3 0 0 1 6 0v4h3z" fill="#5f9b4a"/><path d="M${x + 3.5} ${y - 2}h6a3 3 0 0 0 3 -3v-6a3 3 0 0 0 -6 0v3h-3z" fill="#5f9b4a"/></g>
    <ellipse cx="${x}" cy="${y + 19}" rx="12" ry="2.5" fill="#b8a867" opacity=".6"/>`;
  const pebbles = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" fill="#000" opacity=".12"/><ellipse cx="${x + 6}" cy="${y + 2}" rx="2.4" ry="1.6" fill="#000" opacity=".12"/>`;

  function art(terrain, cx, cy) {
    const ix = cx, iy = cy - 24;
    switch (terrain) {
      case 'forest': return tuft(cx - 30, cy + 8, '#1f7a2c') + tuft(cx + 30, cy + 8, '#1f7a2c') + pine(ix, iy + 2, 0.95);
      case 'pasture': return tuft(cx - 30, cy + 6, '#76a826') + tuft(cx + 30, cy + 6, '#76a826') + tuft(cx - 22, cy - 26, '#76a826') + sheepIcon(ix - 2, iy + 2);
      case 'fields': return tuft(cx - 30, cy + 6, '#d09612') + tuft(cx + 30, cy + 6, '#d09612') + wheatIcon(ix, iy + 2);
      case 'hills': return pebbles(cx - 30, cy + 8) + pebbles(cx + 26, cy + 6) + brickIcon(ix, iy + 6);
      case 'mountains': return pebbles(cx - 30, cy + 8) + pebbles(cx + 26, cy + 6) + rockIcon(ix, iy + 4);
      case 'desert': return pebbles(cx - 26, cy + 14) + pebbles(cx + 20, cy - 16) + cactus(cx, cy - 4);
    }
    return '';
  }

  // A small sailing ship that carries the harbor's trade rate on its sail.
  function ship(X, Y, type) {
    const col = RES_COLOR[type];
    return `<g filter="url(#f-shadow)">
      <path d="M${X - 22} ${Y + 10}q22 8 44 0" stroke="#e9f6ff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M${X - 20} ${Y + 1}h40l-7 10h-26z" fill="#c07a3a" stroke="#6b3f17" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M${X - 17} ${Y + 5}h34" stroke="#f2c27a" stroke-width="1.6"/>
      <path d="M${X} ${Y + 1}V${Y - 34}" stroke="#6b3f17" stroke-width="2.2"/>
      <path d="M${X} ${Y - 34}l9 3l-9 3z" fill="${col}"/>
      <path d="M${X - 15} ${Y - 28}q15 -4 30 0v24q-15 4 -30 0z" fill="#fffdf6" stroke="#b9ae93" stroke-width="1.4" stroke-linejoin="round"/>
    </g>
    <svg x="${X - 8}" y="${Y - 28}" width="16" height="16" viewBox="0 0 24 24" style="color:${col}" aria-hidden="true">${RES_ICON[type]}</svg>
    <text x="${X}" y="${Y - 6}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="900" font-size="10.5" fill="#3a2a1a">${type === 'any' ? '3:1' : '2:1'}</text>`;
  }

  function staticLayer(s) {
    const b = s.board;
    const out = [];
    out.push(`<rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#p-waves)"/>`);
    // shallow water, foam line and beach
    out.push(`<g>${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 1.24)}" fill="#3f93d6" stroke="#3f93d6" stroke-width="6" stroke-linejoin="round"/>`).join('')}</g>`);
    out.push(`<g>${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 1.16)}" fill="#dff3fb" stroke="#dff3fb" stroke-width="5" stroke-linejoin="round"/>`).join('')}</g>`);
    out.push(`<g filter="url(#f-soft)">${b.hexes.map((_, hi) => `<polygon points="${hexPts(hi, 1.11)}" fill="#f1d898" stroke="#f1d898" stroke-width="4" stroke-linejoin="round"/>`).join('')}</g>`);
    // harbors: wooden piers from both corners, ship out in the water
    b.ports.forEach((port) => {
      const e = G.edges[port.edge];
      const va = G.vertices[e.a], vb = G.vertices[e.b];
      const h = G.hexes[e.hexes[0]];
      const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
      const dx = mx - h.x, dy = my - h.y, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      [va, vb].forEach((v) => {
        const x2 = v.x + ux * 0.42, y2 = v.y + uy * 0.42;
        out.push(`<line x1="${P(v.x)}" y1="${P(v.y)}" x2="${P(x2)}" y2="${P(y2)}" stroke="#7b4a20" stroke-width="10" stroke-linecap="butt"/>`);
        out.push(`<line x1="${P(v.x)}" y1="${P(v.y)}" x2="${P(x2)}" y2="${P(y2)}" stroke="#d99a52" stroke-width="7" stroke-dasharray="3 2.2"/>`);
      });
      const X = (mx + ux * 0.8) * S, Y = (my + uy * 0.8) * S + 10;
      const name = port.type === 'any' ? 'Puerto 3:1: cambia 3 iguales por 1' : `Puerto 2:1 de ${E.RES_NAME[port.type]}`;
      out.push(`<g><title>${name}</title>${ship(X, Y, port.type)}</g>`);
    });
    // terrain tiles: dark rim, flat face, light inner bevel
    b.hexes.forEach((hx, hi) => {
      const [face, rim, hl] = TERR[hx.terrain];
      const h = G.hexes[hi];
      const cx = h.x * S, cy = h.y * S;
      out.push(`<g><title>${E.TERRAIN_NAME[hx.terrain]}${hx.num ? ' · ' + hx.num : ''}${E.TERRAIN_RES[hx.terrain] ? ' · produce ' + E.RES_NAME[E.TERRAIN_RES[hx.terrain]] : ''}</title>`);
      out.push(`<polygon points="${hexPts(hi, 0.985)}" fill="${rim}" stroke="${shade(rim, -0.25)}" stroke-width="1.5" stroke-linejoin="round"/>`);
      out.push(`<polygon points="${hexPts(hi, 0.9)}" fill="${face}" stroke="${hl}" stroke-width="3" stroke-linejoin="round"/>`);
      out.push(art(hx.terrain, cx, cy));
      if (hx.num) {
        const hot = hx.num === 6 || hx.num === 8;
        const pips = 6 - Math.abs(7 - hx.num);
        const ink = hot ? '#d0142c' : '#1f4a2a';
        const ty = cy + 14;
        out.push(`<g filter="url(#f-shadow)"><rect x="${cx - 17}" y="${ty - 16}" width="34" height="32" rx="6" fill="#f9f7f0" stroke="#d4ccb6" stroke-width="1.2"/></g>`);
        out.push(`<text x="${cx}" y="${ty + 5}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="900" font-size="${hot ? 21 : 19}" fill="${ink}" stroke="${ink}" stroke-width=".6">${hx.num}</text>`);
        for (let i = 0; i < pips; i++) out.push(`<circle cx="${(cx + (i - (pips - 1) / 2) * 4.4).toFixed(1)}" cy="${ty + 11}" r="1.6" fill="${ink}"/>`);
      }
      out.push('</g>');
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
      out.push(`<polygon points="${hexPts(b.robber, 0.9)}" fill="rgba(20,30,40,.28)" pointer-events="none"/>`);
      const rx = cx + 24, ry = cy - 4;
      out.push(`<g pointer-events="none" filter="url(#f-shadow)"><ellipse cx="${rx}" cy="${ry + 19}" rx="11" ry="3.5" fill="rgba(0,0,0,.3)"/><path d="M${rx - 11} ${ry + 18}q0 -6 6 -8q-5 -5 -3 -12q3 -7 8 -7t8 7q2 7 -3 12q6 2 6 8z" fill="#9a9ea6" stroke="#55585f" stroke-width="1.4"/><circle cx="${rx}" cy="${ry - 14}" r="7" fill="#a9adb4" stroke="#55585f" stroke-width="1.4"/><ellipse cx="${rx - 2.5}" cy="${ry - 16.5}" rx="2.4" ry="1.6" fill="#fff" opacity=".55"/></g>`);
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
