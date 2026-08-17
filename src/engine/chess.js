// ============================================================
//  Chinese Chess Engine — 中国象棋规则（纯逻辑，无 DOM）
//  双人对战版：只包含走子规则与胜负判定，不含 AI。
//  使用 ES Module，供浏览器端 import 使用。
// ============================================================

export const PIECE = {
  general: 'general', advisor: 'advisor', elephant: 'elephant',
  horse: 'horse', chariot: 'chariot', cannon: 'cannon', soldier: 'soldier'
};

export const NAMES = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '馬', chariot: '車', cannon: '炮', soldier: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' }
};

export const COLS = 9, ROWS = 10;
export const PALACE = { red: { r1: 7, r2: 9, c1: 3, c2: 5 }, black: { r1: 0, r2: 2, c1: 3, c2: 5 } };

export function initBoard() {
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

export function cloneBoard(b) { return b.map(row => row.map(p => p ? { ...p } : null)); }

export function getGeneral(b, color) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color && p.type === PIECE.general) return { r, c };
  }
  return null;
}

export function rawMoves(b, r, c) {
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

export function inCheck(b, color) {
  const g = getGeneral(b, color); if (!g) return true;
  const opp = color === 'red' ? 'black' : 'red';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === opp && rawMoves(b, r, c).some(m => m.r === g.r && m.c === g.c)) return true;
  }
  return false;
}

export function getLegalMoves(b, r, c) {
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

export function hasLegalMove(b, color) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && p.color === color && getLegalMoves(b, r, c).length > 0) return true;
  }
  return false;
}

export function getAllLegalMoves(b, color) {
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
export function applyMove(b, fr, fc, tr, tc) {
  const taken = b[tr][tc];
  b[tr][tc] = b[fr][fc];
  b[fr][fc] = null;
  return taken;
}
