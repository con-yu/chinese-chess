// ============================================================
//  Canvas 渲染层 — 棋盘 / 棋子 / UI / 弹窗（全部 Canvas 绘制）
//  坐标系使用「逻辑像素」，每帧通过 ctx.setTransform(dpr,...) 缩放。
//  首页交互（密码/昵称输入）由 HTML 浮层负责，本层仅绘制静态封面。
// ============================================================
import { NAMES, COLS, ROWS } from '../engine/chess.js';

export const COLORS = {
  bgDeep: '#1a1410',
  bgPanel: '#241e18',
  gold: '#d4a854',
  goldDim: '#a88634',
  red: '#c0392b',
  black: '#1a1a2e',
  text: '#e8ddd0',
  textDim: '#a09080',
  board1: '#d4a854',
  board2: '#c89a44',
  board3: '#a87a34',
  line: '#4a2d0c'
};

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------- 布局计算 ----------------------
function computeLayout(W, H) {
  const headerH = Math.max(46, H * 0.06);
  const playerH = Math.max(42, H * 0.055);
  const historyH = Math.max(40, H * 0.06);
  const m = W * 0.02;
  const boardTop = headerH + playerH;
  const boardBottom = H - historyH;
  const availW = W - m * 2;
  const availH = (boardBottom - boardTop) - m * 2;
  // 棋盘总宽 = 格子区(8*cell) + 左右边距(2*pad)，pad = cell*0.55
  // 所以总宽 = 9.1*cell，总高 = 9.1*cell（9 格行距 + 2*pad）
  const padScale = 0.55;
  const boardRatio = 9.1; // (8 + 2*0.55)
  let cell = Math.min(availW / boardRatio, availH / boardRatio);
  cell = Math.max(20, Math.min(cell, 80));
  const bw = cell * 8, bh = cell * 9;
  const pad = cell * padScale;
  const boardW = bw + pad * 2, boardH = bh + pad * 2;
  const boardX = (W - boardW) / 2;
  const boardY = boardTop + (boardBottom - boardTop - boardH) / 2;
  const ox = boardX + pad, oy = boardY + pad;
  return {
    headerH, playerH, historyH, boardX, boardY, boardW, boardH,
    ox, oy, cell, pad,
    boardRect: { x: boardX, y: boardY, w: boardW, h: boardH }
  };
}

export function cellCenter(layout, r, c) {
  return { x: layout.ox + c * layout.cell, y: layout.oy + r * layout.cell };
}

// 触摸坐标 -> 棋盘格；命中返回 {r,c}，否则 null
export function hitTestCell(layout, x, y) {
  const c = Math.round((x - layout.ox) / layout.cell);
  const r = Math.round((y - layout.oy) / layout.cell);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    const cx = layout.ox + c * layout.cell, cy = layout.oy + r * layout.cell;
    if (Math.hypot(x - cx, y - cy) < layout.cell * 0.55) return { r, c };
  }
  return null;
}

// ---------------------- 背景 ----------------------
function drawBackground(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#221a12');
  g.addColorStop(1, '#120d09');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------- 首页（静态封面，交互在 HTML 浮层） ----------------------
export function renderHome(ctx, game, W, H, dpr) {
  drawBackground(ctx, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold ${Math.round(W * 0.11)}px "STKaiti","KaiTi",serif`;
  ctx.shadowColor = 'rgba(212,168,84,0.4)';
  ctx.shadowBlur = 20;
  ctx.fillText('中国象棋', W / 2, H * 0.2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.textDim;
  ctx.font = `${Math.round(W * 0.04)}px sans-serif`;
  ctx.fillText('在线大厅 · 邀约好友实时对战', W / 2, H * 0.27);
}

// ---------------------- 对局界面 ----------------------
export function renderGame(ctx, game, W, H, dpr) {
  drawBackground(ctx, W, H);
  const layout = computeLayout(W, H);

  layout.headerBtns = drawHeader(ctx, game, layout, W);
  drawPlayerBar(ctx, game, layout, W);
  drawBoard(ctx, layout);
  drawBoardAndPieces(ctx, game, layout);

  // 等待对手提示
  if (game.online && game.online.waiting) {
    drawWaiting(ctx, layout, W, H);
  }
  return layout;
}

function drawWaiting(ctx, layout, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, layout.headerH + layout.playerH, W, layout.boardRect.h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold ${Math.round(W * 0.05)}px "STKaiti","KaiTi",serif`;
  ctx.shadowColor = 'rgba(212,168,84,0.5)'; ctx.shadowBlur = 12;
  const cy = layout.headerH + layout.playerH + layout.boardRect.h / 2;
  ctx.fillText('等待对手加入...', W / 2, cy - W * 0.03);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.textDim;
  ctx.font = `${Math.round(W * 0.033)}px sans-serif`;
  ctx.fillText('房间密码已就绪，对手输入相同密码即可开始', W / 2, cy + W * 0.035);
}

function drawHeader(ctx, game, layout, W) {
  const buttons = headerButtons(game);
  let x = W - W * 0.02;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold ${Math.round(layout.headerH * 0.42)}px "STKaiti","KaiTi",serif`;
  ctx.textAlign = 'left';
  ctx.fillText('象棋', W * 0.03, layout.headerH / 2);

  const bw = Math.max(54, W * 0.16), bh = layout.headerH * 0.6, gap = W * 0.015;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    const bx = x - bw;
    b._rect = { x: bx, y: (layout.headerH - bh) / 2, w: bw, h: bh };
    drawSmallButton(ctx, b._rect, b.label);
    x = bx - gap;
  }
  return buttons;
}

function headerButtons(game) {
  // 在线对战：返回 + 记录 + 消息 + 新局（无悔棋，保证公平）
  return [
    { id: 'back', label: '返回' },
    { id: 'log', label: '记录' },
    { id: 'chat', label: '消息' },
    { id: 'new', label: '新局' }
  ];
}

function drawSmallButton(ctx, rect, label) {
  ctx.save();
  ctx.fillStyle = COLORS.bgPanel;
  ctx.strokeStyle = COLORS.goldDim; ctx.lineWidth = 1;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h * 0.3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.font = `${Math.round(rect.h * 0.42)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

function drawPlayerBar(ctx, game, layout, W) {
  const y = layout.headerH;
  const h = layout.playerH;
  const redName = game.players.red.name;
  const blackName = game.players.black.name;

  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.32)}px sans-serif`;
  if (game.turn === 'red') {
    ctx.fillStyle = '#e74c3c';
    ctx.shadowColor = 'rgba(231,76,60,0.5)'; ctx.shadowBlur = 12;
  } else { ctx.fillStyle = COLORS.textDim; ctx.shadowBlur = 0; }
  ctx.fillText('🔴 ' + redName, W * 0.03, y + h / 2);
  ctx.shadowBlur = 0;

  ctx.textAlign = 'right';
  if (game.turn === 'black') {
    ctx.fillStyle = '#cfcfcf';
    ctx.shadowColor = 'rgba(200,200,200,0.4)'; ctx.shadowBlur = 12;
  } else { ctx.fillStyle = COLORS.textDim; ctx.shadowBlur = 0; }
  ctx.fillText(blackName + ' ⚫', W * 0.97, y + h / 2);
  ctx.shadowBlur = 0;

  let indicator, bg, fg;
  if (game.gameOver) { indicator = '对局结束'; bg = 'rgba(212,168,84,0.15)'; fg = COLORS.gold; }
  else if (game.online && game.online.waiting) { indicator = '等待对手...'; bg = 'rgba(212,168,84,0.12)'; fg = COLORS.gold; }
  else if (game.turn === 'red') { indicator = '红方走棋' + (game._check ? ' (将军!)' : ''); bg = 'rgba(231,76,60,0.15)'; fg = '#e74c3c'; }
  else { indicator = '黑方走棋' + (game._check ? ' (将军!)' : ''); bg = 'rgba(140,140,140,0.18)'; fg = '#cfcfcf'; }
  const iw = Math.min(W * 0.34, ctx.measureText(indicator).width + 28);
  const ih = h * 0.56, ix = W / 2 - iw / 2, iy = y + (h - ih) / 2;
  ctx.fillStyle = bg;
  roundRect(ctx, ix, iy, iw, ih, ih / 2); ctx.fill();
  ctx.strokeStyle = fg; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = fg; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(ih * 0.5)}px sans-serif`;
  ctx.fillText(indicator, W / 2, y + h / 2);
}

function drawBoard(ctx, layout) {
  const { boardX, boardY, boardW, boardH, ox, oy, cell } = layout;
  const g = ctx.createRadialGradient(boardX + boardW / 2, boardY + boardH / 2, 0, boardX + boardW / 2, boardY + boardH / 2, boardW * 0.7);
  g.addColorStop(0, COLORS.board1); g.addColorStop(0.5, COLORS.board2); g.addColorStop(1, COLORS.board3);
  ctx.fillStyle = g;
  roundRect(ctx, boardX, boardY, boardW, boardH, 8); ctx.fill();

  ctx.fillStyle = 'rgba(139,105,20,0.08)';
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647);
  for (let i = 0; i < 50; i++) {
    const x = boardX + (rnd() % 1000) / 1000 * boardW;
    const y = boardY + (rnd() % 1000) / 1000 * boardH;
    ctx.fillRect(x, y, 1 + rnd() % 3, 1 + rnd() % 3);
  }

  ctx.strokeStyle = '#5a3d0c'; ctx.lineWidth = 2.5;
  ctx.strokeRect(ox, oy, cell * (COLS - 1), cell * (ROWS - 1));

  ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1;
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(ox, oy + r * cell); ctx.lineTo(ox + (COLS - 1) * cell, oy + r * cell); ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) {
      ctx.beginPath(); ctx.moveTo(ox + c * cell, oy); ctx.lineTo(ox + c * cell, oy + (ROWS - 1) * cell); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ox + c * cell, oy); ctx.lineTo(ox + c * cell, oy + 4 * cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + c * cell, oy + 5 * cell); ctx.lineTo(ox + c * cell, oy + 9 * cell); ctx.stroke();
    }
  }
  for (const side of ['red', 'black']) {
    const c1 = 3, c2 = 5;
    const y1 = side === 'black' ? 0 : 7, y2 = side === 'black' ? 2 : 9;
    ctx.beginPath(); ctx.moveTo(ox + c1 * cell, oy + y1 * cell); ctx.lineTo(ox + c2 * cell, oy + y2 * cell); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox + c2 * cell, oy + y1 * cell); ctx.lineTo(ox + c1 * cell, oy + y2 * cell); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(90,61,12,0.35)';
  ctx.font = `${cell * 0.55}px "STKaiti","KaiTi","Microsoft YaHei",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('楚 河', ox + 2 * cell, oy + 4.5 * cell);
  ctx.fillText('汉 界', ox + 6 * cell, oy + 4.5 * cell);
  ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1;
  const t = cell * 0.12, off = cell * 0.16;
  const marks = [];
  [0, 1, 2, 3, 5, 6, 7, 8].forEach(c => { marks.push([ox + c * cell, oy, 0, -t, 0, -off]); marks.push([ox + c * cell, oy + 9 * cell, 0, t, 0, off]); });
  [0, 1, 2, 3, 5, 6, 7, 8, 9].filter(r => r !== 4).forEach(r => { marks.push([ox, oy + r * cell, -t, 0, -off, 0]); marks.push([ox + 8 * cell, oy + r * cell, t, 0, off, 0]); });
  for (const m of marks) { ctx.beginPath(); ctx.moveTo(m[0] + m[4], m[1] + m[5]); ctx.lineTo(m[0] + m[4] + m[2], m[1] + m[5] + m[3]); ctx.stroke(); }
}

function drawBoardAndPieces(ctx, game, layout) {
  const { ox, oy, cell } = layout;
  if (game.selected && game.validMoves) {
    for (const m of game.validMoves) {
      const { x, y } = cellCenter(layout, m.r, m.c);
      const occupied = game.board[m.r][m.c];
      if (occupied) {
        ctx.strokeStyle = 'rgba(255,50,50,0.7)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.46, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,50,50,0.6)';
        ctx.beginPath(); ctx.arc(x, y, cell * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = game.board[r][c];
    if (!p) continue;
    if (game.animating && r === game.animating.toR && c === game.animating.toC) continue;
    const { x, y } = cellCenter(layout, r, c);
    drawPiece(ctx, x, y, p, game.selected && game.selected.r === r && game.selected.c === c, cell);
  }
  if (game.animating) {
    const a = game.animating;
    const f = cellCenter(layout, a.fromR, a.fromC);
    const t = cellCenter(layout, a.toR, a.toC);
    const k = 1 - Math.pow(1 - a.progress, 3);
    const cx = f.x + (t.x - f.x) * k, cy = f.y + (t.y - f.y) * k;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + cell * 0.4, cell * 0.32, cell * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    drawPiece(ctx, cx, cy, a.piece, false, cell);
  }
}

function drawPiece(ctx, cx, cy, piece, selected, cell) {
  const radius = cell * 0.42;
  const isRed = piece.color === 'red';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + radius * 0.85, radius * 0.9, radius * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  if (selected) { ctx.shadowColor = isRed ? 'rgba(255,60,60,0.7)' : 'rgba(120,120,255,0.6)'; ctx.shadowBlur = radius * 0.6; }
  const g = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
  if (isRed) { g.addColorStop(0, '#f5e6d0'); g.addColorStop(0.5, '#e8d5b8'); g.addColorStop(1, '#c8a878'); }
  else { g.addColorStop(0, '#e8dcc0'); g.addColorStop(0.5, '#d4c8a8'); g.addColorStop(1, '#b0a080'); }
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isRed ? '#b83020' : '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = isRed ? 'rgba(184,48,32,0.3)' : 'rgba(50,50,50,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2); ctx.stroke();
  const name = NAMES[piece.color][piece.type];
  ctx.fillStyle = isRed ? '#b83020' : '#222';
  ctx.font = `bold ${radius * 1.2}px "STKaiti","KaiTi","Noto Sans SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, cy + 1);
}

// ---------------------- 结算弹窗 ----------------------
export function renderOverlay(ctx, game, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const boxW = W * 0.72, boxH = H * 0.32, bx = W / 2 - boxW / 2, by = H / 2 - boxH / 2;
  const g = ctx.createLinearGradient(0, by, 0, by + boxH);
  g.addColorStop(0, '#2c241c'); g.addColorStop(1, '#1c1610');
  ctx.fillStyle = g;
  roundRect(ctx, bx, by, boxW, boxH, 16); ctx.fill();
  ctx.strokeStyle = COLORS.goldDim; ctx.lineWidth = 2; ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ov = game.gameOver;
  ctx.fillStyle = ov.winner === 'red' ? '#e74c3c' : '#cfcfcf';
  ctx.font = `bold ${Math.round(boxW * 0.13)}px "STKaiti","KaiTi",serif`;
  const title = ov.winner === 'red' ? '🔴 红方胜' : '⚫ 黑方胜';
  ctx.fillText(title, W / 2, by + boxH * 0.28);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = `${Math.round(boxW * 0.06)}px sans-serif`;
  const reason = ov.reason === '将杀' ? '将杀 — 对方无路可逃' : '困毙 — 无子可走';
  ctx.fillText(reason, W / 2, by + boxH * 0.48);

  const btnW = boxW * 0.7, btnH = boxH * 0.22, bxx = W / 2 - btnW / 2, byy = by + boxH * 0.62;
  drawButton(ctx, { x: bxx, y: byy, w: btnW, h: btnH, label: '再来一局', primary: true }, true);
  game._overlayBtn = { x: bxx, y: byy, w: btnW, h: btnH };
}

function drawButton(ctx, b, primary) {
  ctx.save();
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  if (primary) { g.addColorStop(0, COLORS.gold); g.addColorStop(1, COLORS.goldDim); }
  else { g.addColorStop(0, '#3a3026'); g.addColorStop(1, '#2a221a'); }
  ctx.fillStyle = g;
  roundRect(ctx, b.x, b.y, b.w, b.h, b.h * 0.18);
  ctx.fill();
  if (!primary) { ctx.strokeStyle = COLORS.goldDim; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.fillStyle = primary ? COLORS.bgDeep : COLORS.gold;
  ctx.font = `bold ${Math.round(b.h * 0.4)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
  ctx.restore();
}
