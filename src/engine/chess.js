// ============================================================
//  Chinese Chess Engine — 中国象棋规则 + AI 引擎（纯逻辑，无 DOM）
//  导出为 CommonJS 模块，供微信小游戏 require 使用。
// ============================================================

const PIECE = {
  general: 'general', advisor: 'advisor', elephant: 'elephant',
  horse: 'horse', chariot: 'chariot', cannon: 'cannon', soldier: 'soldier'
};

const NAMES = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '馬', chariot: '車', cannon: '炮', soldier: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' }
};

const COLS = 9, ROWS = 10;
const PALACE = { red: { r1: 7, r2: 9, c1: 3, c2: 5 }, black: { r1: 0, r2: 2, c1: 3, c2: 5 } };

function initBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const set = (r, c, color, type) => { b[r][c] = { color, type }; };
  for (let c = 0; c < COLS; c++) {
    const types = [PIECE.chariot, PIECE.horse, PIECE.elephant, PIECE.advisor, PIECE.general, PIECE.advisor, PIECE.elephant, PIECE.horse, PIECE.chariot];
    set(0, c, 'black', types[c]);
  }
  set(2, 1, 'black', PIECE.cannon); set(2, 7, 'black', PIECE.cannon);
  for (let c = 0; c < COLS; c += 2) set(3, c, 'black', PIECE.soldier);
  for (let c = 0; c < COLS; c++) {
    const types = [PIECE.chariot, PIECE.horse, PIECE.elephant, PIECE.advisor, PIECE.general, PIECE.advisor, PIECE.elephant, PIECE.horse, PIECE.chariot];
    set(9, c, 'red', types[c]);
  }
  set(7, 1, 'red', PIECE.cannon); set(7, 7, 'red', PIECE.cannon);
  for (let c = 0; c < COLS; c += 2) set(6, c, 'red', PIECE.soldier);
  return b;
}

function cloneBoard(b) { return b.map(row => row.map(p => p ? { ...p } : null)); }

function getGeneral(b, color) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color && p.type === PIECE.general) return { r, c };
  }
  return null;
}

function rawMoves(b, r, c) {
  const p = b[r][c]; if (!p) return [];
  const moves = [];
  const inBounds = (rr, cc) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS;
  const add = (rr, cc) => { if (inBounds(rr, cc) && (!b[rr][cc] || b[rr][cc].color !== p.color)) moves.push({ r: rr, c: cc }); };
  const occupied = (rr, cc) => inBounds(rr, cc) && b[rr][cc] !== null;

  switch (p.type) {
    case PIECE.general: {
      const pa = p.color === 'red' ? PALACE.red : PALACE.black;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= pa.r1 && rr <= pa.r2 && cc >= pa.c1 && cc <= pa.c2) add(rr, cc);
      }
      const opp = p.color === 'red' ? 'black' : 'red';
      const oppG = getGeneral(b, opp);
      if (oppG && oppG.c === c) {
        let blocked = false;
        for (let rr = Math.min(r, oppG.r) + 1; rr < Math.max(r, oppG.r); rr++) { if (b[rr][c]) { blocked = true; break; } }
        if (!blocked) add(oppG.r, oppG.c);
      }
      break;
    }
    case PIECE.advisor: {
      const pa = p.color === 'red' ? PALACE.red : PALACE.black;
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= pa.r1 && rr <= pa.r2 && cc >= pa.c1 && cc <= pa.c2) add(rr, cc);
      }
      break;
    }
    case PIECE.elephant: {
      const minR = p.color === 'red' ? 5 : 0, maxR = p.color === 'red' ? 9 : 4;
      for (const [dr, dc, br, bc] of [[-2, -2, -1, -1], [-2, 2, -1, 1], [2, -2, 1, -1], [2, 2, 1, 1]]) {
        const rr = r + dr, cc = c + dc, brr = r + br, bcc = c + bc;
        if (inBounds(rr, cc) && rr >= minR && rr <= maxR && !occupied(brr, bcc)) add(rr, cc);
      }
      break;
    }
    case PIECE.horse: {
      for (const [dr, dc, br, bc] of [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0], [-1, -2, 0, -1], [-1, 2, 0, 1], [1, -2, 0, -1], [1, 2, 0, 1]]) {
        const rr = r + dr, cc = c + dc, brr = r + br, bcc = c + bc;
        if (inBounds(rr, cc) && !occupied(brr, bcc)) add(rr, cc);
      }
      break;
    }
    case PIECE.chariot: {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc)) {
          if (b[rr][cc]) { if (b[rr][cc].color !== p.color) moves.push({ r: rr, c: cc }); break; }
          moves.push({ r: rr, c: cc }); rr += dr; cc += dc;
        }
      }
      break;
    }
    case PIECE.cannon: {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let rr = r + dr, cc = c + dc, jumped = false;
        while (inBounds(rr, cc)) {
          if (!jumped) { if (b[rr][cc]) { jumped = true; } else moves.push({ r: rr, c: cc }); }
          else { if (b[rr][cc]) { if (b[rr][cc].color !== p.color) moves.push({ r: rr, c: cc }); break; } }
          rr += dr; cc += dc;
        }
      }
      break;
    }
    case PIECE.soldier: {
      const forward = p.color === 'red' ? -1 : 1;
      const crossed = p.color === 'red' ? r <= 4 : r >= 5;
      add(r + forward, c);
      if (crossed) { add(r, c - 1); add(r, c + 1); }
      break;
    }
  }
  return moves;
}

function inCheck(b, color) {
  const g = getGeneral(b, color); if (!g) return true;
  const opp = color === 'red' ? 'black' : 'red';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === opp && rawMoves(b, r, c).some(m => m.r === g.r && m.c === g.c)) return true;
  }
  return false;
}

function getLegalMoves(b, r, c) {
  const p = b[r][c]; if (!p) return [];
  const raw = rawMoves(b, r, c);
  const legal = [];
  for (const m of raw) {
    const nb = cloneBoard(b);
    nb[m.r][m.c] = nb[r][c]; nb[r][c] = null;
    if (!inCheck(nb, p.color)) legal.push(m);
  }
  return legal;
}

function hasLegalMove(b, color) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color && getLegalMoves(b, r, c).length > 0) return true;
  }
  return false;
}

function getAllLegalMoves(b, color) {
  const all = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color) {
      const moves = getLegalMoves(b, r, c);
      for (const m of moves) all.push({ fr: r, fc: c, tr: m.r, tc: m.c });
    }
  }
  return all;
}

// 在棋盘上落子（会改变 b），返回被吃掉的棋子或 null
function applyMove(b, fr, fc, tr, tc) {
  const taken = b[tr][tc];
  b[tr][tc] = b[fr][fc];
  b[fr][fc] = null;
  return taken;
}

// ============================================================
//  AI Engine — Minimax + Alpha-Beta + 静态搜索
// ============================================================
const PVAL = {
  general: 10000, chariot: 920, cannon: 460, horse: 410,
  elephant: 200, advisor: 200, soldier: 100
};
const SOLDIER_CROSSED_BONUS = 120;
const MOBILITY_WEIGHT = 3;
const CHECK_BONUS = 80;

const PST = {
  chariot: [
    [12, 16, 14, 20, 18, 20, 14, 16, 12],
    [14, 18, 16, 22, 24, 22, 16, 18, 14],
    [10, 14, 12, 18, 20, 18, 12, 14, 10],
    [10, 16, 14, 20, 22, 20, 14, 16, 10],
    [8, 12, 10, 16, 18, 16, 10, 12, 8],
    [8, 12, 10, 16, 16, 16, 10, 12, 8],
    [4, 8, 6, 12, 12, 12, 6, 8, 4],
    [2, 6, 4, 10, 10, 10, 4, 6, 2],
    [6, 2, 6, 12, 6, 12, 6, 2, 6],
    [-4, 6, 4, 10, 10, 10, 4, 6, -4]
  ],
  cannon: [
    [6, 4, 0, -8, -10, -8, 0, 4, 6],
    [2, 2, 0, -2, -10, -2, 0, 2, 2],
    [2, 2, 0, -8, -6, -8, 0, 2, 2],
    [0, 0, -2, 4, 10, 4, -2, 0, 0],
    [0, 0, 0, 2, 8, 2, 0, 0, 0],
    [-2, 0, 4, 2, 6, 2, 4, 0, -2],
    [0, 0, 0, 2, 4, 2, 0, 0, 0],
    [6, 0, 8, 6, 10, 6, 8, 0, 6],
    [2, 4, 6, 8, 8, 8, 6, 4, 2],
    [2, 4, 6, 8, 6, 8, 6, 4, 2]
  ],
  horse: [
    [4, 8, 16, 12, 4, 12, 16, 8, 4],
    [4, 10, 28, 16, 8, 16, 28, 10, 4],
    [12, 14, 16, 20, 18, 20, 16, 14, 12],
    [8, 24, 18, 24, 20, 24, 18, 24, 8],
    [6, 16, 14, 18, 16, 18, 14, 16, 6],
    [4, 12, 16, 14, 12, 14, 16, 12, 4],
    [2, 6, 8, 6, 10, 6, 8, 6, 2],
    [4, 2, 8, 8, 4, 8, 8, 2, 4],
    [0, 2, 4, 4, -2, 4, 4, 2, 0],
    [0, -6, 0, 0, 2, 0, 0, -6, 0]
  ],
  advisor: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 26, 30, 26, 0, 0, 0],
    [0, 0, 0, 36, 0, 36, 0, 0, 0]
  ],
  elephant: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 24, 0, 0, 0, 24, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [20, 0, 0, 0, 28, 0, 0, 0, 20],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 24, 0, 0, 0, 24, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]
  ],
  general: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 6, 2, 0, 0, 0],
    [0, 0, 0, 12, 0, 12, 0, 0, 0],
    [0, 0, 0, 0, 24, 0, 0, 0, 0]
  ],
  soldier: [
    [22, 36, 58, 82, 102, 82, 58, 36, 22],
    [18, 30, 46, 64, 76, 64, 46, 30, 18],
    [12, 22, 34, 48, 56, 48, 34, 22, 12],
    [6, 12, 20, 30, 38, 30, 20, 12, 6],
    [2, 6, 12, 18, 22, 18, 12, 6, 2],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
};

function getPST(type, color, r, c) {
  if (color === 'black') r = 9 - r;
  const t = PST[type];
  return (t && t[r]) ? t[r][c] : 0;
}

function countRawMoves(b, color) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color) n += rawMoves(b, r, c).length;
  }
  return n;
}

function evaluateBoard(b, color) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c]; if (!p) continue;
    let v = PVAL[p.type] || 0;
    if (p.type === PIECE.soldier) {
      const crossed = p.color === 'red' ? r <= 4 : r >= 5;
      if (crossed) v += SOLDIER_CROSSED_BONUS;
    }
    v += getPST(p.type, p.color, r, c);
    score += (p.color === color) ? v : -v;
  }
  score += countRawMoves(b, color) * MOBILITY_WEIGHT;
  score -= countRawMoves(b, color === 'red' ? 'black' : 'red') * MOBILITY_WEIGHT;
  if (inCheck(b, color)) score -= CHECK_BONUS;
  if (inCheck(b, color === 'red' ? 'black' : 'red')) score += CHECK_BONUS;
  return score;
}

function quiescence(b, alpha, beta, isMaximizing, aiColor) {
  const standPat = evaluateBoard(b, aiColor);
  if (isMaximizing) {
    if (standPat >= beta) return { score: beta };
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return { score: alpha };
    if (standPat < beta) beta = standPat;
  }
  const color = isMaximizing ? aiColor : (aiColor === 'red' ? 'black' : 'red');
  const moves = getAllLegalMoves(b, color);
  const caps = moves.filter(m => b[m.tr][m.tc] !== null);
  if (caps.length === 0) return { score: standPat };
  caps.sort((m1, m2) => {
    const va = PVAL[b[m1.tr][m1.tc].type] || 0;
    const vb = PVAL[b[m2.tr][m2.tc].type] || 0;
    return vb - va;
  });
  let best = { score: isMaximizing ? -Infinity : Infinity };
  for (const m of caps) {
    const nb = cloneBoard(b);
    nb[m.tr][m.tc] = nb[m.fr][m.fc]; nb[m.fr][m.fc] = null;
    const res = quiescence(nb, alpha, beta, !isMaximizing, aiColor);
    if (isMaximizing) {
      if (res.score > best.score) best = { ...res, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
      alpha = Math.max(alpha, best.score);
    } else {
      if (res.score < best.score) best = { ...res, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
      beta = Math.min(beta, best.score);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function minimax(bd, depth, alpha, beta, isMaximizing, aiColor) {
  const humanColor = aiColor === 'red' ? 'black' : 'red';
  if (depth === 0) return quiescence(bd, alpha, beta, isMaximizing, aiColor);
  const color = isMaximizing ? aiColor : humanColor;
  const moves = getAllLegalMoves(bd, color);
  if (moves.length === 0) {
    return { score: isMaximizing ? -99999 + depth : 99999 - depth };
  }
  moves.sort((m1, m2) => {
    const v1 = m1.tr !== undefined && bd[m1.tr] && bd[m1.tr][m1.tc] ? (PVAL[bd[m1.tr][m1.tc].type] || 0) : 0;
    const v2 = m2.tr !== undefined && bd[m2.tr] && bd[m2.tr][m2.tc] ? (PVAL[bd[m2.tr][m2.tc].type] || 0) : 0;
    return v2 - v1;
  });
  let best = null;
  if (isMaximizing) {
    best = { score: -Infinity };
    for (const m of moves) {
      const nb = cloneBoard(bd);
      nb[m.tr][m.tc] = nb[m.fr][m.fc]; nb[m.fr][m.fc] = null;
      const oppInCheck = inCheck(nb, color === 'red' ? 'black' : 'red');
      const ext = (oppInCheck && depth > 1) ? 1 : 0;
      const res = minimax(nb, depth - 1 + ext, alpha, beta, false, aiColor);
      if (res.score > best.score) best = { ...res, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
      alpha = Math.max(alpha, best.score);
      if (beta <= alpha) break;
    }
  } else {
    best = { score: Infinity };
    for (const m of moves) {
      const nb = cloneBoard(bd);
      nb[m.tr][m.tc] = nb[m.fr][m.fc]; nb[m.fr][m.fc] = null;
      const oppInCheck = inCheck(nb, color === 'red' ? 'black' : 'red');
      const ext = (oppInCheck && depth > 1) ? 1 : 0;
      const res = minimax(nb, depth - 1 + ext, alpha, beta, true, aiColor);
      if (res.score < best.score) best = { ...res, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
      beta = Math.min(beta, best.score);
      if (beta <= alpha) break;
    }
  }
  return best;
}

function getAIMove(b, aiColor, depth) {
  const result = minimax(b, depth, -Infinity, Infinity, true, aiColor);
  if (!result || result.fr === undefined) return null;
  return { fr: result.fr, fc: result.fc, tr: result.tr, tc: result.tc };
}

module.exports = {
  PIECE, NAMES, COLS, ROWS, PALACE,
  initBoard, cloneBoard, getGeneral, rawMoves, inCheck,
  getLegalMoves, hasLegalMove, getAllLegalMoves, applyMove,
  getAIMove, evaluateBoard
};
