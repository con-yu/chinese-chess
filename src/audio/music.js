// ============================================================
//  古风休闲背景音乐 — 使用 Web Audio API 合成（无外部音频文件）
//  采用中国五声音阶（宫商角徵羽），营造古风休闲氛围。
//  提供大厅与对局两套不同节奏的 BGM。
// ============================================================

// 五声音阶（C 宫调式）：宫 商 角 徵 羽
const PENTATONIC = { base: 261.63, ratios: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] }; // C D E G A

let ctx = null;
let masterGain = null;
let muted = false;
let scheduleTimer = null;
let currentPattern = null;   // 当前播放的序列
let currentMode = null;      // 'lobby' | 'game' | null
let nextNoteTime = 0;
let noteIndex = 0;

// 简单混响/空间感：feedback delay
let delayNode = null;

function ensureAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.5;
    masterGain.connect(ctx.destination);
    // 空间感：feedback delay
    delayNode = ctx.createDelay();
    delayNode.delayTime.value = 0.35;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    delayNode.connect(fb);
    fb.connect(delayNode);
    delayNode.connect(wet);
    wet.connect(masterGain);
    delayNode.connect(ctx.destination); // 让 delay 也能响
  } catch (e) {
    ctx = null;
  }
}

// 音符 -> 频率
function noteFreq(n) {
  const octave = Math.floor(n / 5);
  const idx = ((n % 5) + 5) % 5;
  return PENTATONIC.base * Math.pow(2, octave) * PENTATONIC.ratios[idx];
}

// 播放一个音符：tone 音色，dur 时长，vol 音量
function playNote(t, freq, dur, vol, type, detune) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  // 音色：叠加一个八度泛音增加古风共鸣
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = freq * 2;
  osc2.detune.value = 4;
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;

  // 包络（ADSR）
  const a = 0.015, peak = 0.35, sus = 0.6;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak * vol, t + a);
  g.gain.exponentialRampToValueAtTime(peak * vol * sus, t + a + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(g);
  osc2.connect(g2);
  g.connect(masterGain);
  g2.connect(masterGain);
  // 也送入 delay 增加空间感
  if (delayNode) {
    const gd = ctx.createGain();
    gd.gain.value = 0.4;
    g.connect(gd);
    gd.connect(delayNode);
  }

  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc2.start(t);
  osc2.stop(t + dur + 0.05);
}

// 节奏单位时间（秒）
const STEP = 0.22;

// 大厅 BGM：悠扬的宫调式琶音，中速
const LOBBY_PATTERN = [
  { n: 0, len: 1, type: 'sine', vol: 1.0, dur: 1.1 },   // C4
  { n: 4, len: 1, type: 'sine', vol: 0.9, dur: 1.0 },   // A4
  { n: 2, len: 1, type: 'sine', vol: 0.9, dur: 1.0 },   // E4
  { n: 5, len: 1, type: 'sine', vol: 0.9, dur: 1.0 },   // C5
  { n: 4, len: 1, type: 'sine', vol: 0.85, dur: 1.0 },  // A4
  { n: 1, len: 1, type: 'sine', vol: 0.85, dur: 1.0 },  // D4
  { n: 2, len: 1, type: 'sine', vol: 0.85, dur: 1.0 },  // E4
  { n: 3, len: 1, type: 'sine', vol: 0.85, dur: 1.0 },  // G4
  { n: 4, len: 1, type: 'sine', vol: 0.9, dur: 1.1 },   // A4
  { n: 2, len: 1, type: 'sine', vol: 0.8, dur: 0.9 },   // E4
  { n: 0, len: 1, type: 'sine', vol: 0.9, dur: 1.2 },   // C4
  { rest: true, len: 1 }
];

// 对局 BGM：更舒缓空灵，长音 + 轻柔拨弦
const GAME_PATTERN = [
  { n: 0, len: 2, type: 'sine', vol: 1.0, dur: 2.2 },   // C4 长音
  { n: 2, len: 1, type: 'triangle', vol: 0.6, dur: 1.2 }, // E4
  { n: 4, len: 2, type: 'sine', vol: 0.9, dur: 2.0 },   // A4 长音
  { n: 3, len: 1, type: 'triangle', vol: 0.55, dur: 1.2 }, // G4
  { n: 5, len: 2, type: 'sine', vol: 0.85, dur: 2.0 },  // C5 长音
  { n: 4, len: 1, type: 'triangle', vol: 0.5, dur: 1.0 }, // A4
  { n: 2, len: 1, type: 'sine', vol: 0.8, dur: 1.4 },   // E4
  { n: 1, len: 2, type: 'sine', vol: 0.85, dur: 2.0 },  // D4 长音
  { n: 2, len: 1, type: 'triangle', vol: 0.5, dur: 1.0 }, // E4
  { n: 3, len: 1, type: 'sine', vol: 0.8, dur: 1.2 },   // G4
  { n: 2, len: 2, type: 'sine', vol: 0.85, dur: 2.0 },  // E4 长音
  { rest: true, len: 2 }
];

// 调度器：提前调度音符，保证连续
function scheduler() {
  if (!ctx || !currentPattern) return;
  const bpmScale = currentMode === 'lobby' ? 1.0 : 0.8; // 对局更慢
  const step = STEP * (currentMode === 'lobby' ? 1.0 : 1.35);
  const lookahead = 0.15;
  while (nextNoteTime < ctx.currentTime + lookahead + 0.3) {
    const note = currentPattern[noteIndex % currentPattern.length];
    if (!note.rest) {
      const freq = noteFreq(note.n);
      const dur = note.dur * (currentMode === 'lobby' ? 1.0 : 1.1);
      playNote(nextNoteTime, freq, dur, note.vol, note.type);
    }
    nextNoteTime += step * note.len;
    noteIndex++;
  }
  scheduleTimer = setTimeout(scheduler, 80);
}

// 播放指定 BGM 模式
function play(mode) {
  ensureAudio();
  if (!ctx) return;
  // 若已在该模式且正在播，不重启
  if (currentMode === mode && currentPattern) return;
  // 停掉当前调度
  stopScheduler();
  currentMode = mode;
  currentPattern = mode === 'lobby' ? LOBBY_PATTERN : GAME_PATTERN;
  noteIndex = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  // 恢复上下文（若被浏览器挂起）
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  scheduler();
}

function stopScheduler() {
  if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
}

function stop() {
  stopScheduler();
  currentPattern = null;
  currentMode = null;
}

// 静音切换，返回当前是否静音
function toggleMute() {
  muted = !muted;
  if (ctx && masterGain) masterGain.gain.value = muted ? 0 : 0.5;
  return muted;
}

function isMuted() { return muted; }

export { play, stop, toggleMute, isMuted };
