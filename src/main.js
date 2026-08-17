// ============================================================
//  主流程 — Web 双人在线对战（在线大厅 + 邀请对战）
//  大厅交互（登录/玩家列表/邀请）由 HTML 负责；
//  对局棋盘/弹窗由 Canvas 渲染层负责。
// ============================================================
import * as Chess from './engine/chess.js';
import * as Renderer from './render/renderer.js';
import { Network } from './net/network.js';

let canvas, ctx;
let W = 0, H = 0, dpr = 1;

// 大厅前端状态
let myId = null;
let myName = '';
let lobbyPlayers = [];        // [{id,name,status}]
let pendingInviteTo = null;   // 我正邀请的玩家 id
let invitedFrom = null;       // 谁在邀请我 {id,name}

const game = {
  screen: 'home',              // 'home'(大厅) | 'playing' | 'overlay'
  board: Chess.initBoard(),
  turn: 'red',
  selected: null,
  validMoves: [],
  moveHistory: [],
  captured: { red: [], black: [] },
  players: { red: { name: '红方' }, black: { name: '黑方' } },
  myColor: 'red',
  animating: null,
  gameOver: null,              // {winner, reason}
  online: { connected: false, started: false },
  _layout: null,
  _overlayBtn: null,
  _check: false
};

// ---------------------- 初始化 ----------------------
function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('mousedown', onPointer);
  canvas.addEventListener('touchstart', onPointer, { passive: false });

  // 大厅事件
  document.getElementById('login-btn').addEventListener('click', onLogin);
  document.getElementById('input-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') onLogin(); });
  document.getElementById('logout-btn').addEventListener('click', backToHome);
  document.getElementById('invite-cancel-btn').addEventListener('click', cancelInvite);
  document.getElementById('player-list').addEventListener('click', onPlayerClick);

  registerNetwork();
  requestAnimationFrame(loop);
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
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

// 一步棋落定后的处理：判定胜负
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
}

// ---------------------- 登录 / 大厅 ----------------------
function onLogin() {
  const nameEl = document.getElementById('input-name');
  const name = (nameEl.value || '').trim() || '玩家';
  myName = name;
  showToast('连接中...');
  Network.connect(name);
}

function showLobby() {
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('lobby-panel').style.display = 'flex';
  document.getElementById('me-avatar').textContent = firstChar(myName);
  document.getElementById('me-name').textContent = myName;
  try { localStorage.setItem('cc_name', myName); } catch (e) {}
}

function renderPlayerList() {
  const list = document.getElementById('player-list');
  const count = document.getElementById('online-count');
  count.textContent = lobbyPlayers.length;
  if (lobbyPlayers.length === 0) {
    list.innerHTML = '<div class="empty-tip">暂无其他在线玩家</div>';
    return;
  }
  list.innerHTML = lobbyPlayers.map(p => {
    const avatar = escapeHtml(firstChar(p.name));
    const nm = escapeHtml(p.name);
    return `<div class="player-item" data-id="${p.id}">
      <div class="avatar">${avatar}</div>
      <div class="nm">${nm}</div>
      <div class="status">在线</div>
    </div>`;
  }).join('');
}

function onPlayerClick(e) {
  const item = e.target.closest('.player-item');
  if (!item) return;
  if (pendingInviteTo) { showToast('请先取消当前邀请'); return; }
  const id = parseInt(item.dataset.id, 10);
  const p = lobbyPlayers.find(x => x.id === id);
  if (!p) return;
  // 弹确认
  openModal(
    `邀请对战`,
    `确定要向 <b>${escapeHtml(p.name)}</b> 发起对局邀请吗？`,
    [
      { text: '邀请', ok: true, fn: () => { sendInvite(p); } },
      { text: '取消', ok: false }
    ]
  );
}

function sendInvite(p) {
  pendingInviteTo = p.id;
  Network.sendInvite(p.id);
  const bar = document.getElementById('invite-pending');
  document.getElementById('invite-pending-text').textContent = `正在邀请 ${p.name}...`;
  bar.style.display = 'flex';
}

function cancelInvite() {
  if (pendingInviteTo != null) {
    Network.sendDecline(pendingInviteTo);
    clearPendingInvite();
    showToast('已取消邀请');
  }
}

function clearPendingInvite() {
  pendingInviteTo = null;
  document.getElementById('invite-pending').style.display = 'none';
}

// 收到邀请
function onInvited(from) {
  invitedFrom = from;
  openModal(
    `对战邀请`,
    `<b>${escapeHtml(from.name)}</b> 邀请你进行一局中国象棋`,
    [
      { text: '接受', ok: true, fn: () => { Network.sendAccept(from.id); invitedFrom = null; } },
      { text: '拒绝', ok: false, fn: () => { Network.sendDecline(from.id); invitedFrom = null; } }
    ]
  );
}

// ---------------------- 模态弹窗 ----------------------
function openModal(title, descHtml, buttons) {
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-desc').innerHTML = descHtml;
  const btnsEl = document.getElementById('modal-btns');
  btnsEl.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = b.ok ? 'ok' : 'cancel';
    btn.textContent = b.text;
    btn.addEventListener('click', () => {
      closeModal();
      if (b.fn) b.fn();
    });
    btnsEl.appendChild(btn);
  }
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// ---------------------- 进入对局 ----------------------
function beginGame(color, opponentName) {
  game.board = Chess.initBoard();
  game.turn = 'red';
  game.selected = null; game.validMoves = []; game.moveHistory = [];
  game.captured = { red: [], black: [] };
  game.animating = null; game.gameOver = null;
  game.myColor = color;
  game.online = { connected: true, started: true };
  game.players = color === 'red'
    ? { red: { name: myName }, black: { name: opponentName } }
    : { red: { name: opponentName }, black: { name: myName } };
  game.screen = 'playing';
  // 隐藏大厅，显示走棋记录面板
  document.getElementById('lobby').style.display = 'none';
  showHistoryPanel(true);
  updateHistoryPanel();
}

// ---------------------- 输入 ----------------------
function onPointer(e) {
  e.preventDefault();
  let x, y;
  if (e.touches && e.touches.length > 0) {
    x = e.touches[0].clientX;
    y = e.touches[0].clientY;
  } else {
    x = e.clientX;
    y = e.clientY;
  }
  handleTouch(x, y);
}

function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function handleTouch(x, y) {
  if (game.screen === 'overlay') return handleOverlayTouch(x, y);
  if (game.screen === 'home') return; // 大厅交互在 HTML
  const layout = game._layout;
  if (layout && layout.headerBtns) {
    for (const b of layout.headerBtns) {
      if (b._rect && inRect(x, y, b._rect)) { handleHeaderButton(b.id); return; }
    }
  }
  if (game.gameOver || game.animating) return;
  if (!game.online.started) return;
  if (game.turn !== game.myColor) return; // 不是我的回合，忽略点击
  const pos = Renderer.hitTestCell(layout, x, y);
  if (pos) handleBoardTouch(pos.r, pos.c);
}

function handleHeaderButton(id) {
  if (id === 'back') backToHome();
  else if (id === 'new') { /* 在线对局无重开，需回大厅重新邀约 */ }
}

function handleOverlayTouch(x, y) {
  if (game._overlayBtn && inRect(x, y, game._overlayBtn)) {
    backToHome();
  }
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
  if (!remote) Network.sendMove({ r: fr, c: fc }, { r: tr, c: tc });
  updateHistoryPanel();
}

// ---------------------- 走棋记录面板 ----------------------
function updateHistoryPanel() {
  const panel = document.getElementById('history-panel');
  const scroll = document.getElementById('history-scroll');
  const count = document.getElementById('history-count');
  if (!panel || !scroll || !count) return;
  if (game.screen !== 'playing') return;

  const hist = game.moveHistory;
  count.textContent = hist.length;
  // 保留最后一个 DOM 引用用于滚动，其余重建
  const frag = document.createDocumentFragment();
  for (let i = 0; i < hist.length; i++) {
    const mv = hist[i];
    const step = document.createElement('div');
    step.className = 'history-step';
    const side = mv.piece.color === 'red' ? '红' : '黑';
    const name = Chess.NAMES[mv.piece.color][mv.piece.type];
    const digit = '９８７６５４３２１';
    step.innerHTML =
      `<span class="side ${mv.piece.color}">${side}</span>` +
      `<span class="piece">${name}</span>` +
      `<span class="from">${digit[mv.fc]}${mv.fr + 1}</span>` +
      `<span class="arrow">→</span>` +
      `<span class="from">${digit[mv.tc]}${mv.tr + 1}</span>`;
    frag.appendChild(step);
  }
  scroll.innerHTML = '';
  scroll.appendChild(frag);
  // 自动滚动到最新一步
  scroll.scrollLeft = scroll.scrollWidth;
}

function showHistoryPanel(show) {
  const panel = document.getElementById('history-panel');
  if (panel) panel.classList.toggle('show', show);
  if (!show) {
    const scroll = document.getElementById('history-scroll');
    const count = document.getElementById('history-count');
    if (scroll) scroll.innerHTML = '';
    if (count) count.textContent = '0';
  }
}

// ---------------------- 返回大厅 ----------------------
function backToHome() {
  Network.close();
  resetState();
  showHomeScreen();
}

function resetState() {
  game.screen = 'home';
  game.board = Chess.initBoard();
  game.selected = null; game.validMoves = []; game.moveHistory = [];
  game.captured = { red: [], black: [] };
  game.animating = null; game.gameOver = null;
  game.online = { connected: false, started: false };
  game._check = false;
  myId = null;
  lobbyPlayers = [];
  pendingInviteTo = null;
  invitedFrom = null;
  clearPendingInvite();
  showHistoryPanel(false);
}

function showHomeScreen() {
  document.getElementById('lobby').style.display = 'flex';
  document.getElementById('login-panel').style.display = 'flex';
  document.getElementById('lobby-panel').style.display = 'none';
}

function setGameOver(winner, reason) {
  game.gameOver = { winner, reason };
  game.screen = 'overlay';
}

// ---------------------- Toast / 工具 ----------------------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function firstChar(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function defaultName() {
  try { return localStorage.getItem('cc_name') || ('玩家' + Math.floor(Math.random() * 1000)); } catch (e) { return '玩家'; }
}

// ---------------------- 网络事件 ----------------------
function registerNetwork() {
  Network.on('open', () => { game.online.connected = true; });

  Network.on('loginOk', (d) => {
    myId = d.me.id;
    showLobby();
  });

  Network.on('onlineList', (d) => {
    lobbyPlayers = (d.players || []).filter(p => p.status === 'lobby');
    renderPlayerList();
  });

  Network.on('playerOnline', (d) => {
    if (d.player.status !== 'lobby') return;
    if (!lobbyPlayers.find(x => x.id === d.player.id)) {
      lobbyPlayers.push(d.player);
      renderPlayerList();
    }
  });

  Network.on('playerOffline', (d) => {
    lobbyPlayers = lobbyPlayers.filter(p => p.id !== d.id);
    renderPlayerList();
  });

  Network.on('invited', (d) => {
    onInvited(d.from);
  });

  Network.on('inviteDeclined', (d) => {
    clearPendingInvite();
    showToast(`${d.from.name} 拒绝了你的邀请`);
  });

  Network.on('opponentBusy', () => {
    clearPendingInvite();
    showToast('对方正在对局或已被邀请');
  });

  Network.on('start', (d) => {
    beginGame(d.color, (d.opponent && d.opponent.name) || '对手');
    showToast('对局开始!');
  });

  Network.on('opponentMove', (d) => {
    if (game.animating) { setTimeout(() => doMove(d.from.r, d.from.c, d.to.r, d.to.c, true), 240); }
    else doMove(d.from.r, d.from.c, d.to.r, d.to.c, true);
  });

  Network.on('opponentLeft', () => {
    showToast('对手已离开');
    Network.close();
    setTimeout(backToHome, 1300);
  });

  Network.on('serverError', (d) => {
    showToast((d && d.msg) || '服务器错误');
  });

  Network.on('error', () => {
    showToast('网络连接失败，请确认服务器已启动');
    resetState();
    showHomeScreen();
  });

  Network.on('close', () => { game.online.connected = false; });
}

// 首次进入默认填充昵称
(function () {
  try {
    document.getElementById('input-name').value = localStorage.getItem('cc_name') || '';
  } catch (e) {}
})();

init();
