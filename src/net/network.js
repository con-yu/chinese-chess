// ============================================================
//  在线对战网络层 — 基于浏览器原生 WebSocket
//  在线大厅 + 邀请对战协议：
//    客户端 -> 服务器: {type:'login', name}
//    服务器 -> 客户端: {type:'login_ok', me:{id,name}}
//    服务器 -> 客户端: {type:'online_list', players:[{id,name,status}]}   // 除自己外的在线玩家
//    服务器 -> 客户端: {type:'player_online', player:{id,name,status}}    // 新玩家上线
//    服务器 -> 客户端: {type:'player_offline', id}                        // 玩家下线
//    客户端 -> 服务器: {type:'invite', to}                                // A 邀请 B
//    服务器 -> 客户端: {type:'invited', from:{id,name}}                   // B 收到邀请
//    客户端 -> 服务器: {type:'accept', to}                                // B 接受
//    客户端 -> 服务器: {type:'decline', to}                               // B 拒绝
//    服务器 -> 客户端: {type:'invite_declined', from:{id,name}}           // A 被告知被拒
//    服务器 -> 客户端: {type:'start', color, opponent:{id,name}}          // 双方进入对局
//    服务器 -> 客户端: {type:'opponent_busy'}                             // 对方忙碌/已被邀请
//    客户端 -> 服务器: {type:'move', from:{r,c}, to:{r,c}}
//    服务器 -> 客户端: {type:'move', from:{r,c}, to:{r,c}}                // 转发给对手
//    服务器 -> 客户端: {type:'opponent_left'}                             // 对手离开
//    服务器 -> 客户端: {type:'error', msg}
// ============================================================
import { SERVER_URL } from '../config.js';

export const Network = {
  ws: null,
  handlers: {},
  name: null,

  on(event, cb) { this.handlers[event] = cb; },
  _emit(event, data) { const h = this.handlers[event]; if (h) h(data); },

  _route(data) {
    switch (data.type) {
      case 'login_ok': this._emit('loginOk', data); break;
      case 'online_list': this._emit('onlineList', data); break;
      case 'player_online': this._emit('playerOnline', data); break;
      case 'player_offline': this._emit('playerOffline', data); break;
      case 'invited': this._emit('invited', data); break;
      case 'invite_declined': this._emit('inviteDeclined', data); break;
      case 'start': this._emit('start', data); break;
      case 'move': this._emit('opponentMove', data); break;
      case 'opponent_left': this._emit('opponentLeft', data); break;
      case 'opponent_busy': this._emit('opponentBusy', data); break;
      case 'error': this._emit('serverError', data); break;
      default: break;
    }
  },

  connect(name) {
    this.name = name;
    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      this._emit('open');
      // 连接成功后登录大厅
      this.send({ type: 'login', name: this.name });
    };

    this.ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      this._route(data);
    };

    this.ws.onerror = () => this._emit('error');
    this.ws.onclose = () => this._emit('close');
  },

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  },

  sendMove(from, to) {
    this.send({ type: 'move', from, to });
  },

  sendInvite(toId) { this.send({ type: 'invite', to: toId }); },
  sendAccept(toId) { this.send({ type: 'accept', to: toId }); },
  sendDecline(toId) { this.send({ type: 'decline', to: toId }); },

  close() {
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
  }
};
