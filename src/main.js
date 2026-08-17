// ============================================================
//  主流程 — 屏幕状态 / 输入 / 对战编排 / AI / 网络
// ============================================================
const Chess = require('./engine/chess.js');
const Renderer = require('./render/renderer.js');
const Network = require('./net/network.js');
const CONFIG = require('./config.js');

let canvas, ctx;
let W = 0, H = 0, dpr = 2;

const game = {
  screen: 'home',                 // 'home' | 'playing' | 'overlay'
  mode: null,                     // 'online' | 'local' | 'ai'
  board: Chess.initBoard(),
  turn: 'red',
  selected: null,
  validMoves: [],
  moveHistory: [],
  captured: { red: [], black: [] },
  players: { red: { name: '红方' }, black: { name: '黑方' } },
  myColor: 'red',
  animating: null,
  gameOver: null,                 // {winner, reason}
  aiThinking: false,
  aiDepth: 3,
  online: { connected: false, started: false, waiting: false, opponentName: '' },
  _myName: '玩家',
  _layout: null,
  _overlayBtn: null,
  _check: false
};

// ---------------------- 初始化 ----------------------
function init() {
  canvas = wx.createCanvas();
  ctx = canvas.getContext('2d');
  const info = wx.getSystemInfoSync();
  W = info.screenWidth;
  H = info.screenHeight;
  dpr = info.pixelRatio || 2;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  try { wx.setKeepScreenOn({ keepScreenOn: true }); } catch (e) {}
  registerNetwork();
  wx.onTouchStart(onTouch);
  requestAnimationFrame(loop);
}

// ---------------------- 渲染循环 ----------------------
function loop() {
  const t = Date.now();
  if (game.animating) {
    game.animating.progress = Math.min(1, (t - game.animating.startTime) / game.animating.duration);
    if (game.animating.progress >= 1) {
      game.animating = null;
      afterSettled();
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (game.screen === 'home') {
    game._layout = Renderer.renderHome(ctx, game, W, H, dpr);
  } else {
    game._layout = Renderer.renderGame(ctx, game, W, H, dpr);
    if (game.screen === 'overlay') Renderer.renderOverlay(ctx, game, W, H);
  }
  requestAnimationFrame(loop);
}

// 一步棋落定后的处理：判定胜负 / 触发 AI
function afterSettled() {
  if (game.gameOver) return;
  const inCh = Chess.inCheck(game.board, game.turn);
  const hasLegal = Chess.hasLegalMove(game.board, game.turn);
  if (!hasLegal) {
    const winner = game.turn === 'red' ? 'black' : 'red';
    setGameOver(winner, inCh ? '将杀' : '困毙');
    return;
  }
  game._check = inCh;
  if (game.mode === 'ai') scheduleAI();
}

// ---------------------- 输入 ----------------------
function onTouch(e) {
  const t = e.touches && e.touches[0];
  if (!t) return;
  handleTouch(t.clientX, t.clientY);
}

function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function handleTouch(x, y) {
  if (game.screen === 'home') return handleHomeTouch(x, y);
  if (game.screen === 'overlay') return handleOverlayTouch(x, y);
  // playing
  const layout = game._layout;
  if (layout && layout.headerBtns) {
    for (const b of layout.headerBtns) {
      if (b._rect && inRect(x, y, b._rect)) { handleHeaderButton(b.id); return; }
    }
  }
  if (game.gameOver || game.animating || game.aiThinking) return;
  if (game.mode === 'online' && (!game.online.started || game.online.waiting)) return;
  if (game.mode === 'online' && game.turn !== game.myColor) return;
  if (game.mode === 'ai' && game.turn === 'black') return; // AI 回合，忽略点击
  const pos = Renderer.hitTestCell(layout, x, y);
  if (pos) handleBoardTouch(pos.r, pos.c);
}

function handleHomeTouch(x, y) {
  const layout = game._layout;
  if (!layout || !layout.buttons) return;
  for (const b of layout.buttons) {
    if (inRect(x, y, b)) { onHomeButton(b.id); return; }
  }
}

function onHomeButton(id) {
  if (id === 'online') startOnlineFlow();
  else if (id === 'local') newGame('local');
  else if (id === 'ai') startAIFlow();
}

function handleOverlayTouch(x, y) {
  if (game._overlayBtn && inRect(x, y, game._overlayBtn)) overlayAction();
}

function handleHeaderButton(id) {
  if (id === 'back') backToHome();
  else if (id === 'undo') undo();
  else if (id === 'new') newGame(game.mode);
}

function handleBoardTouch(r, c) {
  const clicked = game.board[r][c];
  if (game.selected) {
    const valid = game.validMoves.some(m => m.r === r && m.c === c);
    if (valid) { const from = game.selected; doMove(from.r, from.c, r, c, false); return; }
    if (clicked && clicked.color === game.turn) {
      game.selected = { r, c };
      game.validMoves = Chess.getLegalMoves(game.board, r, c);
      return;
    }
    game.selected = null; game.validMoves = [];
  } else {
    if (clicked && clicked.color === game.turn) {
      game.selected = { r, c };
      game.validMoves = Chess.getLegalMoves(game.board, r, c);
    }
  }
}

// ---------------------- 落子 ----------------------
function doMove(fr, fc, tr, tc, remote) {
  const piece = game.board[fr][fc];
  const taken = game.board[tr][tc];
  game.moveHistory.push({ fr, fc, tr, tc, piece: { ...piece }, captured: taken ? { ...taken } : null });
  if (taken) game.captured[piece.color].push(taken);
  game.animating = { fromR: fr, fromC: fc, toR: tr, toC: tc, piece, progress: 0, startTime: Date.now(), duration: 220 };
  Chess.applyMove(game.board, fr, fc, tr, tc);
  game.turn = game.turn === 'red' ? 'black' : 'red';
  game.selected = null; game.validMoves = [];
  if (!remote && game.mode === 'online') Network.sendMove({ r: fr, c: fc }, { r: tr, c: tc });
}

// ---------------------- 模式启动 ----------------------
function newGame(mode) {
  game.mode = mode;
  game.board = Chess.initBoard();
  game.turn = 'red';
  game.selected = null; game.validMoves = []; game.moveHistory = [];
  game.captured = { red: [], black: [] };
  game.animating = null; game.gameOver = null; game.aiThinking = false;
  game.online = { connected: false, started: false, waiting: false, opponentName: '' };
  game._check = false;
  if (mode === 'local') game.players = { red: { name: '红方' }, black: { name: '黑方' } };
  else if (mode === 'ai') game.players = { red: { name: '你 (红)' }, black: { name: '电脑 (黑)' } };
  game.screen = 'playing';
}

function startAIFlow() {
  wx.showActionSheet({
    itemList: ['初级', '中级', '高级', '大师'],
    success: (res) => {
      const depths = [2, 3, 4, 4];
      game.aiDepth = depths[res.tapIndex] != null ? depths[res.tapIndex] : 3;
      newGame('ai');
    }
  });
}

function startOnlineFlow() {
  const defRoom = randomRoom();
  const defName = savedName();
  wx.showModal({
    title: '加入房间', editable: true, placeholderText: '房间号（双方需一致）', content: defRoom,
    success: (res) => {
      if (!res.confirm) return;
      const room = (res.content || '').trim() || defRoom;
      wx.showModal({
        title: '你的昵称', editable: true, placeholderText: '昵称', content: defName,
        success: (res2) => {
          if (!res2.confirm) return;
          const name = (res2.content || '').trim() || '玩家';
          try { wx.setStorageSync(CONFIG.STORAGE_KEY, name); } catch (e) {}
          beginOnline(room, name);
        }
      });
    }
  });
}

function beginOnline(room, name) {
  game.mode = 'online';
  game._myName = name;
  game.board = Chess.initBoard();
  game.turn = 'red';
  game.selected = null; game.validMoves = []; game.moveHistory = [];
  game.captured = { red: [], black: [] };
  game.animating = null; game.gameOver = null; game.aiThinking = false;
  game.online = { connected: false, started: false, waiting: true, opponentName: '' };
  game.players = { red: { name: name }, black: { name: '???' } };
  game.screen = 'playing';
  wx.showLoading({ title: '连接中...' });
  Network.connect(room, name);
}

// ---------------------- AI ----------------------
function scheduleAI() {
  if (game.mode !== 'ai' || game.gameOver || game.animating) return;
  const aiColor = 'black';
  if (game.turn !== aiColor) return;
  game.aiThinking = true;
  // 先渲染一帧「思考中」，再开始计算（计算会阻塞主线程）
  setTimeout(() => {
    if (game.mode !== 'ai' || game.gameOver || game.turn !== aiColor) { game.aiThinking = false; return; }
    setTimeout(() => {
      if (game.mode !== 'ai' || game.gameOver || game.turn !== aiColor) { game.aiThinking = false; return; }
      const mv = Chess.getAIMove(game.board, aiColor, game.aiDepth);
      game.aiThinking = false;
      if (mv) doMove(mv.fr, mv.fc, mv.tr, mv.tc, false);
    }, 30);
  }, 30);
}

// ---------------------- 悔棋 / 返回 ----------------------
function undo() {
  if (game.mode === 'online') return;
  if (game.moveHistory.length === 0 || game.animating || game.aiThinking) return;
  const steps = game.mode === 'local' ? 1 : 2;
  for (let i = 0; i < steps && game.moveHistory.length > 0; i++) {
    const last = game.moveHistory.pop();
    game.board[last.fr][last.fc] = last.piece;
    game.board[last.tr][last.tc] = last.captured;
    if (last.captured) game.captured[last.piece.color].pop();
    game.turn = game.turn === 'red' ? 'black' : 'red';
  }
  game.selected = null; game.validMoves = []; game.gameOver = null; game._check = false;
}

function backToHome() {
  if (game.mode === 'online') Network.close();
  game.screen = 'home';
  game.animating = null; game.gameOver = null;
}

function setGameOver(winner, reason) {
  game.gameOver = { winner, reason };
  game.screen = 'overlay';
}

function overlayAction() {
  if (game.mode === 'online') backToHome();
  else newGame(game.mode);
}

// ---------------------- 网络事件 ----------------------
function registerNetwork() {
  Network.on('open', () => { game.online.connected = true; });
  Network.on('waiting', () => {
    game.online.waiting = true;
    wx.showToast({ title: '等待对手加入...', icon: 'none' });
  });
  Network.on('start', (d) => {
    wx.hideLoading();
    game.online.started = true; game.online.waiting = false;
    game.myColor = d.color;
    const myName = game._myName;
    const oppName = (d.opponent && d.opponent.name) || '对手';
    if (d.color === 'red') game.players = { red: { name: myName }, black: { name: oppName } };
    else game.players = { red: { name: oppName }, black: { name: myName } };
    game.turn = 'red';
    wx.showToast({ title: '对局开始!', icon: 'success' });
  });
  Network.on('opponentMove', (d) => {
    if (game.animating) { setTimeout(() => doMove(d.from.r, d.from.c, d.to.r, d.to.c, true), 240); }
    else doMove(d.from.r, d.from.c, d.to.r, d.to.c, true);
  });
  Network.on('opponentLeft', () => {
    wx.showToast({ title: '对手已离开', icon: 'none' });
    Network.close();
    setTimeout(backToHome, 1300);
  });
  Network.on('serverError', (d) => {
    wx.showToast({ title: (d && d.msg) || '服务器错误', icon: 'none' });
  });
  Network.on('error', () => {
    wx.hideLoading();
    wx.showToast({ title: '网络连接失败', icon: 'none' });
  });
  Network.on('close', () => { game.online.connected = false; });
}

// ---------------------- 工具 ----------------------
function randomRoom() { return (1000 + Math.floor(Math.random() * 9000)).toString(); }
function savedName() {
  try { return wx.getStorageSync(CONFIG.STORAGE_KEY) || ('玩家' + Math.floor(Math.random() * 1000)); }
  catch (e) { return '玩家'; }
}

init();
