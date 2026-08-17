// ============================================================
//  示例对战服务器（Node.js + ws）
//  部署后，把域名（wss://）填到 src/config.js 的 SERVER_URL。
//  协议见 src/net/network.js 顶部注释。
// ============================================================
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// rooms[roomId] = { players: [ws...], names: {red, black} }
const rooms = {};

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj, except) {
  if (!room) return;
  for (const p of room.players) if (p !== except) send(p, obj);
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.color = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    if (data.type === 'join') {
      const roomId = String(data.room || 'default');
      const name = String(data.name || '玩家');
      if (!rooms[roomId]) rooms[roomId] = { players: [], names: {} };
      const room = rooms[roomId];

      // 满员则拒绝
      if (room.players.length >= 2) {
        send(ws, { type: 'error', msg: '房间已满' });
        return;
      }

      // 第一个进来的执红，第二个执黑
      const color = room.players.length === 0 ? 'red' : 'black';
      ws.room = roomId;
      ws.color = color;
      room.players.push(ws);
      room.names[color] = name;

      if (room.players.length === 2) {
        // 双方到齐，开始对局
        const oppColorOf = (c) => (c === 'red' ? 'black' : 'red');
        room.players.forEach((p) => {
          send(p, {
            type: 'start',
            color: p.color,
            opponent: { name: room.names[oppColorOf(p.color)] }
          });
        });
      } else {
        send(ws, { type: 'waiting', color, room: roomId });
      }
    } else if (data.type === 'move') {
      const room = ws.room ? rooms[ws.room] : null;
      // 只转发给对手
      broadcast(room, { type: 'move', from: data.from, to: data.to }, ws);
    }
  });

  ws.on('close', () => {
    const room = ws.room ? rooms[ws.room] : null;
    if (room) {
      broadcast(room, { type: 'opponent_left' }, ws);
      room.players = room.players.filter((p) => p !== ws);
      delete room.names[ws.color];
      if (room.players.length === 0) delete rooms[ws.room];
    }
  });
});

console.log(`中国象棋对战服务器已启动: ws://localhost:${PORT}`);
