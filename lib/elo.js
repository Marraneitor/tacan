// Multiplayer Elo, built from the chess formula.
//
// A game of N players is scored as N-1 head-to-head matches per player: against each rival you
// "win" (1) if you finished above them, draw (0.5) on equal standing, lose (0) below them.
// Expected score per match is the chess formula E = 1 / (1 + 10^((Rrival - Rme) / 400)).
// The change is K * sum(S - E) / (N - 1), so a 4-player game moves a rating about as much as one chess game,
// and beating stronger rivals pays more than beating weaker ones.
// K follows FIDE: 40 for the first 30 rated games, 10 once a player has reached 2400, otherwise 20.

const START = 1500;

const expected = (me, rival) => 1 / (1 + Math.pow(10, (rival - me) / 400));

function kFactor(p) {
  if ((p.games || 0) < 30) return 40;
  if ((p.peak || 0) >= 2400) return 10;
  return 20;
}

// players: [{ rating, games, peak }], standing: number per player (higher is better, equal = tie).
function rate(players, standing) {
  const n = players.length;
  return players.map((p, i) => {
    let actual = 0, exp = 0;
    players.forEach((q, j) => {
      if (i === j) return;
      actual += standing[i] > standing[j] ? 1 : standing[i] === standing[j] ? 0.5 : 0;
      exp += expected(p.rating, q.rating);
    });
    const k = kFactor(p);
    const delta = Math.round((k * (actual - exp)) / (n - 1));
    const place = 1 + standing.filter((x) => x > standing[i]).length;
    return { before: p.rating, after: p.rating + delta, delta, place, k, actual, expected: exp };
  });
}

// Final standing in a finished Hexalia game: the winner first, then everyone still playing by victory points
// (hidden Monuments included), then players who resigned, the last to resign ranking highest.
function standings(Engine, s) {
  return s.players.map((p, i) => {
    if (i === s.winner) return 1e6;
    if (p.out) return -1000 + (p.outOrder || 0);
    return Engine.victoryPoints(s, i, true);
  });
}

module.exports = { START, expected, kFactor, rate, standings };
