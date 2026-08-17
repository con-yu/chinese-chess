// ============================================================
//  在线对战网络层 — 基于微信小游戏 WebSocket API
//  协议（JSON 文本）：
//    客户端 -> 服务器: {type:'join', room, name}
//    服务器 -> 客户端: {type:'waiting', color, room}
//    服务器 -> 客户端: {type:'start', color, opponent:{name}}
//    客户端 -> 服务器: {type:'move', from:{r,c}, to:{r,c}}
//    服务器 -> 客户端: {type:'move', from:{r,c}, to:{r,c}}
//    服务器 -> 客户端: {type:'opponent_left'}
//    服务器 -> 客户端: {type:'error', msg}
//  服务器需做转发：把一方的 move 转发给同房间另一方。
// ============================================================
const CONFIG = require('../config.js');

const Network = {
  ws: null,
  bound: false,
  handlers: {},
  room: null,
  name: null,

  on(event, cb) { this.handlers[event] = cb; },
  _emit(event, data) { const h = this.handlers[event]; if (h) h(data); },

  _bind() {
    if (this.bound) return;
    this.bound = true;
    wx.onSocketOpen(() => {
      this._emit('open');
      // 连接成功后立即加入房间
      this.send({ type: 'join', room: this.room, name: this.name });
    });
    wx.onSocketMessage((res) => {
      let data;
      try { data = JSON.parse(res.data); } catch (e) { return; }
      this._route(data);
    });
    wx.onSocketClose(() => { this._emit('close'); });
    wx.onSocketError((err) => { this._emit('error', err); });
  },

  _route(data) {
    switch (data.type) {
      case 'waiting': this._emit('waiting', data); break;
      case 'start': this._emit('start', data); break;
      case 'move': this._emit('opponentMove', data); break;
      case 'opponent_left': this._emit('opponentLeft', data); break;
      case 'error': this._emit('serverError', data); break;
      default: break;
    }
  },

  connect(room, name) {
    this._bind();
    this.room = room;
    this.name = name;
    wx.connectSocket({
      url: CONFIG.SERVER_URL,
      fail: (err) => { this._emit('error', err); }
    });
  },

  send(obj) {
    wx.sendSocketMessage({
      data: JSON.stringify(obj),
      fail: () => {}
    });
  },

  sendMove(from, to) {
    this.send({ type: 'move', from, to });
  },

  close() {
    try { wx.closeSocket({ fail: () => {} }); } catch (e) {}
    this.ws = null;
  }
};

module.exports = Network;
