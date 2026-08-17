# 中国象棋 · 双人在线对战（微信小游戏）

将原本的纯前端网页版中国象棋，改造成**符合微信小游戏官方规范的在线对战小游戏**。
提供三种模式：**在线对战**（双人在线）、**本地双人**、**人机对战**（内置 AI 引擎）。

> 棋盘、棋子、菜单、弹窗等全部通过 Canvas 绘制，不依赖任何 DOM，符合小游戏运行环境。

---

## 一、目录结构（小游戏规范）

```
chinese-chess/
├── game.js                 # 小游戏入口（根目录，必须有）
├── game.json               # 小游戏配置（横竖屏、超时等）
├── project.config.json     # 项目配置（含 appid，见下方「待补全」）
├── README.md               # 本说明
├── index.html              # 【原网页版，可保留作参考或删除】
├── src/
│   ├── config.js           # 全局配置（服务器地址，待补全）
│   ├── main.js             # 主流程：屏幕/输入/对战编排/AI/网络
│   ├── engine/chess.js     # 象棋规则 + AI 引擎（纯逻辑）
│   ├── render/renderer.js  # Canvas 渲染（棋盘/棋子/UI/弹窗）
│   └── net/network.js      # 在线对战网络层（WebSocket）
└── server/
    ├── server.js           # 示例对战服务器（Node.js + ws）
    └── package.json        # 服务器依赖
```

---

## 二、如何运行 / 导入

1. 打开**微信开发者工具** → 选择「小游戏」→ 导入项目，目录选 `chinese-chess/`。
2. 按下方「待补全」填好 `project.config.json` 的 `appid`（或先用 `touristappid` 游客模式预览）。
3. 编译即可在模拟器 / 真机预览。

> 本地调试 WebSocket 时，可在开发者工具「详情 → 本地设置」勾选 **不校验合法域名、TLS 版本以及 HTTPS 证书**，以便连开发服务器。

---

## 三、⚠️ 待你补全的配置（重要）

### 1. AppID —— `project.config.json`
```json
"appid": "wxYOUR_APPID_HERE"   // 改成你自己的小程序/小游戏 AppID
```
- 没有 AppID 时，可临时填 `touristappid` 进行本地预览（但真机对战、socket 域名校验需要正式 AppID）。

### 2. 对战服务器地址 —— `src/config.js`
```js
SERVER_URL: 'wss://your-server-domain.com/ws'   // 改成你的 wss 服务地址
```
- 必须是 **wss://**（生产环境要求 TLS），且域名要在
  **微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → socket 合法域名** 中备案。

### 3. 部署示例服务器（可选，用于联机测试）
```bash
cd server
npm install      # 安装 ws
npm start        # 默认监听 ws://localhost:3000
```
- 把 `server.js` 部署到任意支持 WebSocket 的 Node 服务（如云函数 / 容器），用 Nginx 等做 `wss` 反代，再把域名填到上面的 `SERVER_URL`。
- 协议：客户端先发 `{type:'join',room,name}`，服务器凑齐两人后回 `{type:'start',color,opponent}`，之后双方互发 `{type:'move',from,to}`，服务器负责转发给对手。详见 `src/net/network.js` 顶部注释。

---

## 四、在线对战玩法

1. 首页点「在线对战」→ 输入**相同房间号**和昵称（两人在不同设备填同一个房间号）。
2. 先进入者执红并等待；后进入者执黑，两人到齐自动开局。
3. 走子实时同步；任一方无路可走即判负，弹窗可「返回」重新开房。

> 说明：棋盘方向固定为红方在下。若你执黑，你在上半区行棋（功能正常，仅视角未翻转）。如需为黑方翻转棋盘，可在 `src/render/renderer.js` 的 `cellCenter` 增加视角变换。

---

## 五、人机 AI

内置 Minimax + Alpha-Beta + 静态搜索引擎，提供 初级/中级/高级/大师 四档（搜索深度 2~4）。
深度越高越强，但计算耗时增加；移动端建议中级（深度 3）及以上体验较好。
