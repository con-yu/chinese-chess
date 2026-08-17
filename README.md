# 中国象棋 · 双人在线对战（Web 版）

纯 Web 双人在线对战游戏。进入页面后展示**在线大厅**中的每个玩家信息，
**点击玩家头像即可发起对局邀请**，对方接受后进入对局。

> 已移除开房间/密码功能。基于浏览器原生 DOM Canvas + WebSocket，无任何框架依赖。

---

## 一、目录结构

```
chinese-chess/
├── index.html              # Web 入口页（登录 + 在线大厅 + 对局 Canvas）
├── package.json            # 根依赖与脚本
├── favicon.svg
├── src/
│   ├── main.js             # 主流程：大厅 / 邀请 / 对局编排 / 网络
│   ├── config.js           # 全局配置（服务器地址，部署时需改）
│   ├── engine/chess.js     # 象棋规则（纯逻辑，ES Module）
│   ├── render/renderer.js  # Canvas 渲染（棋盘/棋子/弹窗）
│   └── net/network.js      # 在线对战网络层（原生 WebSocket）
├── tools/
│   └── serve.js            # 本地静态文件服务器（无依赖）
└── server/
    ├── server.js           # 对战服务器（在线大厅 + 邀请匹配）
    └── package.json        # 服务器依赖（ws）
```

---

## 二、如何运行

### 1. 启动对战服务器（终端 A）
```bash
cd server
npm install        # 首次安装 ws
npm start          # 默认监听 ws://0.0.0.0:3000
```

### 2. 启动页面服务器（终端 B）
```bash
npm run dev        # 默认 http://localhost:8080
```
浏览器打开 `http://localhost:8080`。

### 3. 开始对战
- 进入页面输入**昵称**，点击「进入大厅」。
- 大厅展示当前所有**在线玩家**（头像 + 昵称）。
- **点击某个玩家** → 确认后发起对局邀请。
- 被邀请方收到「邀请你对战」弹窗，点击「接受」即进入对局。
- 走子实时同步；任一方无路可走即判负。

> 联机测试：可用两个浏览器标签页分别登录不同昵称互相邀请，或两台设备连同一服务器。

---

## 三、⚠️ 部署到服务器时需修改

### 服务器地址 —— `src/config.js`
```js
export const SERVER_URL = 'ws://localhost:3000';
```
- 本地联机调试用 `ws://localhost:3000`。
- 部署后改成你的 WebSocket 服务地址，例如 `ws://你的IP或域名:3000`。
- 若用 Nginx 做 `wss://` 反向代理，则改为 `wss://你的域名/路径`，并配置 TLS 与代理。

### 端口
- 对战服务器端口默认 `3000`，可用环境变量覆盖：`PORT=3000 npm start`。
- 需在云服务器安全组放行该端口（阿里云等控制台操作，SSH 无法直接放行）。

---

## 四、联机协议

```
客户端 -> 服务器: {type:'login', name}
服务器 -> 客户端: {type:'login_ok', me:{id,name}}
服务器 -> 客户端: {type:'online_list', players:[{id,name,status}]}  // 除自己外的在线玩家
服务器 -> 客户端: {type:'player_online', player:{id,name,status}}
服务器 -> 客户端: {type:'player_offline', id}
客户端 -> 服务器: {type:'invite', to}                  // A 邀请 B
服务器 -> 客户端: {type:'invited', from:{id,name}}     // B 收到邀请
客户端 -> 服务器: {type:'accept', to}                  // B 接受
客户端 -> 服务器: {type:'decline', to}                 // B 拒绝
服务器 -> 客户端: {type:'invite_declined', from}       // A 被告知被拒
服务器 -> 客户端: {type:'opponent_busy'}               // 对方忙碌/已被邀请
服务器 -> 客户端: {type:'start', color, opponent:{id,name}}  // 双方进入对局（发起者红）
客户端 -> 服务器: {type:'move', from:{r,c}, to:{r,c}}
服务器 -> 客户端: {type:'move', from:{r,c}, to:{r,c}}
服务器 -> 客户端: {type:'opponent_left'}               // 对手离开
服务器 -> 客户端: {type:'error', msg}
```

---

## 五、玩法说明

- 在线对局中**不提供悔棋**，保证公平。
- 发起邀请方执红，接受方执黑；棋盘方向固定红方在下。
- 正在对局或已有未决邀请的玩家，无法再被他人邀请。
- 对局结束/对手离开后自动返回大厅，可重新邀约其他玩家。
