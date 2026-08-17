// ============================================================
//  双人在线对战服务器（Node.js + ws）
//  在线大厅 + 邀请对战：玩家上线后出现在大厅，可互相点击邀请对战。
//  协议见 src/net/network.js 顶部注释。
// ============================================================
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// 玩家池：id -> { ws, name, status, pendingInviteTo, pendingInviteFrom }
const players = new Map();
// 对局房间：roomId -> { a, b }   （a 执红=发起者，b 执黑=接受者）
const rooms = new Map();
let nextId = 1;

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// 某玩家当前是否空闲可被邀请（在线且在大厅且无未决邀请）
function isInvitable(p) {
  return p && p.status === 'lobby' && !p.pendingInviteFrom && !p.pendingInviteTo;
}

// 广播在线列表（只发大厅状态玩家，给大厅里的人，排除自己）
function broadcastOnlineList() {
  for (const p of players.values()) {
    if (p.status !== 'lobby') continue;
    const list = [];
    for (const q of players.values()) {
      if (q.id !== p.id && q.status === 'lobby') list.push({ id: q.id, name: q.name, status: q.status });
    }
    send(p.ws, { type: 'online_list', players: list });
  }
}

function broadcastPlayerOnline(p) {
  for (const q of players.values()) {
    if (q.id !== p.id && q.status === 'lobby') {
      send(q.ws, { type: 'player_online', player: { id: p.id, name: p.name, status: p.status } });
    }
  }
}

function broadcastPlayerOffline(id) {
  for (const q of players.values()) {
    if (q.id !== id) send(q.ws, { type: 'player_offline', id });
  }
}

wss.on('connection', (ws) => {
  let me = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    if (data.type === 'login') {
      const name = String(data.name || '玩家').slice(0, 12) || '玩家';
      me = { id: nextId++, ws, name, status: 'lobby', pendingInviteTo: null, pendingInviteFrom: null };
      players.set(me.id, me);
      send(ws, { type: 'login_ok', me: { id: me.id, name: me.name } });
      broadcastPlayerOnline(me);
      // 给本人发送当前在线列表
      const list = [];
      for (const q of players.values()) {
        if (q.id !== me.id && q.status === 'lobby') list.push({ id: q.id, name: q.name, status: q.status });
      }
      send(ws, { type: 'online_list', players: list });
    }

    else if (data.type === 'invite') {
      if (!me) return;
      const target = players.get(data.to);
      if (!target) { send(ws, { type: 'error', msg: '对方已离线' }); return; }
      if (!isInvitable(target)) { send(ws, { type: 'opponent_busy' }); return; }
      // 发起者标记：正在邀请对方
      me.pendingInviteTo = target.id;
      target.pendingInviteFrom = me.id;
      send(target.ws, { type: 'invited', from: { id: me.id, name: me.name } });
    }

    else if (data.type === 'accept') {
      if (!me) return;
      const inviter = players.get(data.to);
      if (!inviter || inviter.pendingInviteTo !== me.id) {
        send(ws, { type: 'error', msg: '邀请已失效' });
        return;
      }
      // 双方都标记为对局中
      me.status = 'playing';
      inviter.status = 'playing';
      me.pendingInviteFrom = null;
      inviter.pendingInviteTo = null;
      // 创建对局房间：发起者执红，接受者执黑
      const roomId = 'room_' + me.id + '_' + inviter.id;
      rooms.set(roomId, { a: inviter, b: me });
      send(inviter.ws, { type: 'start', color: 'red', opponent: { id: me.id, name: me.name } });
      send(me.ws, { type: 'start', color: 'black', opponent: { id: inviter.id, name: inviter.name } });
      // 两人离开大厅后，广播更新在线列表
      broadcastOnlineList();
    }

    else if (data.type === 'decline') {
      if (!me) return;
      const inviter = players.get(data.to);
      if (inviter && inviter.pendingInviteTo === me.id) {
        inviter.pendingInviteTo = null;
        send(inviter.ws, { type: 'invite_declined', from: { id: me.id, name: me.name } });
      }
      me.pendingInviteFrom = null;
    }

    else if (data.type === 'move') {
      if (!me) return;
      // 找到我所在房间并转发给对手
      for (const room of rooms.values()) {
        if (room.a === me) { send(room.b.ws, { type: 'move', from: data.from, to: data.to }); break; }
        if (room.b === me) { send(room.a.ws, { type: 'move', from: data.from, to: data.to }); break; }
      }
    }

    else if (data.type === 'chat') {
      if (!me) return;
      const msg = String(data.msg || '').slice(0, 100);
      if (!msg) return;
      // 找到我所在房间并转发给对手（附带发送者颜色）
      for (const room of rooms.values()) {
        if (room.a === me) {
          send(room.b.ws, { type: 'chat', from: { color: 'red', name: me.name }, msg });
          break;
        }
        if (room.b === me) {
          send(room.a.ws, { type: 'chat', from: { color: 'black', name: me.name }, msg });
          break;
        }
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    // 若在对局中，通知对手
    for (const [roomId, room] of rooms) {
      if (room.a === me || room.b === me) {
        const opp = room.a === me ? room.b : room.a;
        send(opp.ws, { type: 'opponent_left' });
        rooms.delete(roomId);
        break;
      }
    }
    // 若我正邀请别人，清除对方对我的记录
    if (me.pendingInviteTo) {
      const target = players.get(me.pendingInviteTo);
      if (target) target.pendingInviteFrom = null;
    }
    // 若有人邀请我，通知对方邀请失效（对方可重新邀请）
    if (me.pendingInviteFrom) {
      const inviter = players.get(me.pendingInviteFrom);
      if (inviter) inviter.pendingInviteTo = null;
    }
    players.delete(me.id);
    broadcastPlayerOffline(me.id);
    broadcastOnlineList();
  });
});

console.log(`中国象棋在线对战服务器已启动: ws://0.0.0.0:${PORT}`);
