/* ============================================================
   edge-tts.js · 零依赖直连微软 Edge 免费语音合成（App 内嵌版）
   ------------------------------------------------------------
   替代服务器版的 python3 + tts.py（execFileSync）方案。
   协议（社区 rany2/edge-tts 7.3.x 已公开）：
     · 2026-10 起微软强制 Sec-MS-GEC v2 令牌：CS64 + 改版 SHA256
       双哈希，格式 "<16hex>-<64hex>"，Sec-MS-GEC-Version 前缀 "2-"。
       两套哈希的常数都被微软改过，无法用标准库实现，必须逐行照搬
       官方 drm.py（本文件的 sha256Init/expandSchedule/sha256Rounds/
       sha256Digest/cs64Digest 即其 JS 移植）。
     · 令牌窗口 5 分钟（FILETIME 100ns ticks 向下取整到 300 秒）。
     · 握手头需伪装 Edge（UA + chrome-extension Origin）并带随机
       muid Cookie；握手 403 时按响应 Date 头校准时钟偏差重试一次。
     · 连上后先发 speech.config，再发 ssml 文本帧；二进制帧跳过
       2 字节头长度取音频，直到文本帧 Path:turn.end 结束。
     · 所有音频分片拼起来就是完整 mp3（audio-24khz-48kbitrate-mono-mp3）。

   WebSocket 客户端为本文件手写的最小 RFC6455 实现（http/https upgrade +
   crypto 掩码帧），只覆盖本场景：客户端发短文本帧、收服务端二进制/文本帧。
   ============================================================ */
'use strict';
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '2-143.0.3650.75';
const WIN_EPOCH = 11644473600;          // 1601-01-01 → 1970-01-01 的秒数
const GEC_WINDOW_SECS = 300;            // 5 分钟窗口
const SYNTH_TIMEOUT_MS = 30000;
const OUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/* ============================================================
   改版 SHA-256 + CS64（照搬 rany2/edge-tts drm.py，勿改常数）
   ============================================================ */
const U32 = 0xFFFFFFFF;
const SHA256_INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SHA256_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
  0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152,
  0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85,
  0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1,
  0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116,
  0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE,
  0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const SHA256_ADJUSTMENT = 0xC9DC06A7;
const SHA256_BLOCK_CONSTANTS = SHA256_ROUND_CONSTANTS.slice(0, 14).concat([SHA256_ADJUSTMENT], SHA256_ROUND_CONSTANTS.slice(15));
const SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;
const CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xF2F90B1A;
const CS64_ADJUSTMENT1 = 0x0B1A0000;

function rol16(v) { v &= U32; return ((v << 16) | (v >>> 16)) >>> 0; }

/* 小 sigma：合并旋转只截断一次（python 里靠最后的 &mask，JS 用 >>>0） */
function sigma0(v) { return ((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3)) >>> 0; }
function sigma1(v) { return ((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10)) >>> 0; }

function expandSchedule(words, firstWord) {
  const start = firstWord == null ? 16 : firstWord;
  for (let i = start; i < 64; i++) {
    const x = words[i - 2], y = words[i - 15];
    const s1 = ((x >>> 17) ^ (x << 15) ^ (x >>> 19) ^ (x << 13) ^ (x >>> 10)) >>> 0;
    const s0 = ((y >>> 7) ^ (y << 25) ^ (y >>> 18) ^ (y << 14) ^ (y >>> 3)) >>> 0;
    words.push((s1 + words[i - 7] + s0 + words[i - 16]) >>> 0);
  }
}

function sha256Rounds(state, words, firstRound, constants) {
  let a = state[0], b = state[1], c = state[2], d = state[3],
    e = state[4], f = state[5], g = state[6], h = state[7];
  for (let i = firstRound; i < 64; i++) {
    /* ROTR 带回绕（python 用 *(2^32+1)>>k 巧妙实现，JS 拆成移位或） */
    const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + S1 + ch + constants[i] + words[i]) >>> 0;
    const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (S0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function sha256Init(data7) {
  const words = new Array(16).fill(0);
  words[14] = data7.readUIntBE(0, 3);          // data[:3] big-endian
  words[15] = data7.readUIntBE(3, 4);          // data[3:7] big-endian
  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index === 16) value += ((sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0);
    else value += sigma1(words[index - 2]);
    if (index - 7 >= 14) value += words[index - 7];
    if (index === 29) value += ((sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0);
    words.push(value >>> 0);
  }
  words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14]
    + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) >>> 0);
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14, SHA256_BLOCK_CONSTANTS);
  return SHA256_INITIAL.map((x, i) => (x + working[i]) >>> 0);
}

function sha256Digest(data) {
  if (data.length < 7) throw new Error('Token salt must contain at least seven bytes');
  const length = 57 + data.length;
  let padded = Buffer.concat([
    data.slice(7),
    Buffer.from([0x80]),
    Buffer.alloc(((55 - length) % 64 + 64) % 64),
  ]);
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64BE(BigInt(length) * 8n);
  padded = Buffer.concat([padded, lenBuf]);
  let state = sha256Init(data.slice(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words = [];
    for (let i = 0; i < 16; i++) words.push(padded.readUInt32BE(off + i * 4));
    expandSchedule(words, 16);
    const working = sha256Rounds(state, words, 0, SHA256_ROUND_CONSTANTS);
    state = state.map((x, i) => (x + working[i]) >>> 0);
  }
  const out = Buffer.alloc(32);
  state.forEach((x, i) => out.writeUInt32BE(x >>> 0, i * 4));
  return out;
}

/* 小端 32 位字、补零到偶数个（python 的 _words_le4_even） */
function wordsLE4Even(data) {
  const pad = ((-data.length) % 4 + 4) % 4;
  const p = Buffer.alloc(data.length + pad);
  data.copy(p, 0);
  const words = [];
  for (let i = 0; i < p.length / 4; i++) words.push(p.readUInt32LE(i * 4));
  if (words.length % 2) words.push(0);
  return words;
}

function cs64Digest(data, digest) {
  let keyA = digest.readUInt32LE(0) | 1;
  let keyB = digest.readUInt32LE(4) | 1;
  const factorA = Math.imul(keyA, CS64_FACTOR) >>> 0;
  const factorB = Math.imul(keyB, CS64_FACTOR) >>> 0;

  const terms = CS64_COEFFICIENTS.map((c, index) => (Math.imul(c[0], index % 2 === 0 ? factorA : factorB) >>> 0));
  const offsets = CS64_COEFFICIENTS.map(c => c[1]);
  const words = wordsLE4Even(Buffer.concat([Buffer.from([0]), data]));
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    let term = Math.imul(word >>> 0, index % 2 === 0 ? keyA : keyB) >>> 0;
    let offset = Math.imul(rol16(word >>> 0), index % 2 === 0 ? 0xEF0569FB : 0xC31713DB) >>> 0;
    if (index === 0) {
      term = (term + Math.imul(CS64_ADJUSTMENT0, factorA)) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  }

  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index], y = terms[index + 1];
    let t = rol16((offsets[index] + x) >>> 0);
    let q = Math.imul(t, 0x76F50F34) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rol16(q), 0xC3EFEA97) >>> 0) + q) >>> 0) >>> 0;
    t = rol16((offsets[index + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881CE3C) >>> 0;
    swapLast = ((Math.imul(rol16(q), 0x35BD1EC9) >>> 0) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (Math.imul(state, keyA) + x) >>> 0;
    state = Math.imul(rol16(state), 0xCF98B111) >>> 0;
    state = Math.imul(rol16(state), 0x87085B9F) >>> 0;
    state = Math.imul(rol16(state), 0x12CEB96D) >>> 0;
    state = Math.imul(rol16(state), 0x257E1D83) >>> 0;
    acc = (acc + state) >>> 0;
    let t2 = (Math.imul(state, keyB) + y) >>> 0;
    t2 = Math.imul(rol16(t2), 0xA27416F5) >>> 0;
    t2 = Math.imul(rol16(t2), 0xD38396FF) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t2), 0x7C932B89) >>> 0), 0xBFA49F69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

/** Sec-MS-GEC v2 令牌："<16hex大写>-<64hex大写>"（CS64-SHA256） */
function secMsGecV2(skewSeconds) {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH + (skewSeconds || 0);
  ticks -= ticks % GEC_WINDOW_SECS;
  const str = (BigInt(ticks) * 10000000n).toString() + TRUSTED_CLIENT_TOKEN;  // ×1e7 → 100ns ticks
  const data = Buffer.from(str, 'ascii');
  const digest = sha256Digest(data);
  const pair = cs64Digest(data, digest);
  const cs64 = Buffer.alloc(8);
  cs64.writeUInt32LE(pair[0], 0);
  cs64.writeUInt32LE(pair[1], 4);
  return cs64.toString('hex').toUpperCase() + '-' + digest.toString('hex').toUpperCase();
}

/* ---------------- 最小 WebSocket 客户端（RFC6455 子集） ---------------- */
function maskFrame(opcode, payload) {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;                       // FIN=1
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

/**
 * 建一条 wss 连接。
 * 返回 Promise<{ socket, onFrame, sendText, close }>；
 * 握手被拒（如 403）时 reject，错误对象带 responseHeaders 供时钟偏差校准。
 */
function wsConnect(urlStr, extraHeaders) {
  const u = new URL(urlStr);
  const isTLS = u.protocol === 'wss:' || u.protocol === 'https:';
  const lib = isTLS ? https : http;
  const key = crypto.randomBytes(16).toString('base64');
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (isTLS ? 443 : 80),
      path: u.pathname + u.search,
      headers: Object.assign({}, extraHeaders, {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      }),
      timeout: SYNTH_TIMEOUT_MS,
    });
    req.on('upgrade', (res, socket, head) => {
      if ((res.headers.upgrade || '').toLowerCase() !== 'websocket') {
        socket.destroy();
        return reject(new Error('握手响应不是 websocket upgrade'));
      }
      socket.setNoDelay(true);
      if (head && head.length) socket.unshift(head);

      let buf = Buffer.alloc(0);
      let pending = null;                          // 分片重组：{ opcode, chunks }
      let onFrame = null;
      const emit = (opcode, data) => { if (onFrame) { try { onFrame(opcode, data); } catch (e) {} } };

      socket.on('data', chunk => {
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
        try {
          while (true) {
            const frame = tryParseFrame(buf);
            if (!frame) break;
            buf = frame.rest;
            const op = frame.opcode & 0x0f;
            if (op === 0x1 || op === 0x2) {        // text / binary（或分片起点）
              if (frame.fin) emit(op, frame.data);
              else pending = { opcode: op, chunks: [frame.data] };
            } else if (op === 0x0) {               // continuation
              if (pending) {
                pending.chunks.push(frame.data);
                if (frame.fin) { emit(pending.opcode, Buffer.concat(pending.chunks)); pending = null; }
              }
            } else if (op === 0x8) {               // close
              try { socket.write(maskFrame(0x8, Buffer.alloc(0))); } catch {}
              socket.end();
            } else if (op === 0x9) {               // ping → pong
              try { socket.write(maskFrame(0xA, frame.data)); } catch {}
            }
          }
        } catch (e) { /* 解析异常丢弃本块，保住进程 */ }
      });
      socket.on('error', e => reject(e));
      socket.on('close', () => emit('close', null));

      resolve({
        socket,
        set onFrame(fn) { onFrame = fn; },
        sendText: s => socket.write(maskFrame(0x1, Buffer.from(s, 'utf8'))),
        close: () => { try { socket.write(maskFrame(0x8, Buffer.alloc(0))); } catch {} socket.end(); },
      });
    });
    req.on('response', res => {
      const e = new Error(`WebSocket 握手被拒绝：HTTP ${res.statusCode}`);
      e.responseHeaders = res.headers;
      res.resume();
      reject(e);
    });
    req.on('timeout', () => { req.destroy(new Error('连接超时 ' + SYNTH_TIMEOUT_MS + 'ms')); });
    req.on('error', reject);
    req.end();
  });
}

/** 从 buf 头部解析一个完整帧；不完整返回 null */
function tryParseFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < off + 2) return null;
    len = buf.readUInt16BE(off); off += 2;
  } else if (len === 127) {
    if (buf.length < off + 8) return null;
    const big = buf.readBigUInt64BE(off); off += 8;
    if (big > BigInt(64 * 1024 * 1024)) throw new Error('帧过大');
    len = Number(big);
  }
  if (masked) off += 4;                            // 服务端帧按规范不掩码，但按头长度跳过
  if (buf.length < off + len) return null;
  return { fin, opcode, data: buf.slice(off, off + len), rest: buf.slice(off + len) };
}

/* ---------------- 合成主流程 ---------------- */
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function timestamp() {
  return new Date().toUTCString()
    .replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

function wssHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/143.0.0.0 Safari/537.36 Edg/143.0.3650.75',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'Cookie': 'muid=' + crypto.randomBytes(16).toString('hex').toUpperCase() + ';',
  };
}

/** 合成一次（内部）：带 skew 校准参数；返回 Buffer */
function synthesizeOnce(text, voice, skewSeconds) {
  const clean = String(text).slice(0, 800).trim();
  if (!clean) return Promise.reject(new Error('没有要合成的文字'));
  const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>"
    + `<voice name='${voice || 'zh-CN-XiaoxiaoNeural'}'>`
    + "<prosody pitch='+0Hz' rate='+0%' volume='+0%'>"
    + xmlEscape(clean)
    + '</prosody></voice></speak>';
  const reqId = crypto.randomBytes(16).toString('hex');
  const connId = crypto.randomUUID().replace(/-/g, '');
  const url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    + `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
    + `&Sec-MS-GEC=${secMsGecV2(skewSeconds)}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
    + `&ConnectionId=${connId}`;

  return new Promise((resolve, reject) => {
    let ws = null;
    const timer = setTimeout(() => {
      if (ws) ws.close();
      reject(new Error('合成超时 ' + SYNTH_TIMEOUT_MS + 'ms'));
    }, SYNTH_TIMEOUT_MS);
    const fail = e => { clearTimeout(timer); if (ws) ws.close(); reject(e); };

    wsConnect(url, wssHeaders()).then(conn => {
      ws = conn;
      const chunks = [];
      conn.onFrame = (opcode, data) => {
        if (opcode === 'close') {
          clearTimeout(timer);
          reject(new Error('连接被服务端关闭，音频不完整'));
          return;
        }
        const s = data.toString('utf8');
        if (opcode === 1 && s.includes('Path:turn.end')) {
          clearTimeout(timer);
          ws.close();
          if (!chunks.length) return reject(new Error('没收到音频'));
          return resolve(Buffer.concat(chunks));
        }
        /* Path:response / audio.metadata 文本帧忽略 */
        if (opcode === 2) {
          if (data.length < 2) return;
          const hlen = data.readUInt16BE(0);
          if (data.length > hlen + 2) chunks.push(data.slice(hlen + 2));
        }
      };
      conn.sendText(
        'X-Timestamp:' + timestamp() + '\r\n'
        + 'Content-Type:application/json; charset=utf-8\r\n'
        + 'Path:speech.config\r\n\r\n'
        + JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
          outputFormat: OUT_FORMAT } } } })
      );
      conn.sendText(
        'X-RequestId:' + reqId + '\r\n'
        + 'Content-Type:application/ssml+xml\r\n'
        + 'X-Timestamp:' + timestamp() + 'Z\r\n'
        + 'Path:ssml\r\n\r\n' + ssml
      );
    }).catch(fail);
  });
}

/**
 * 合成一段文字 → mp3 Buffer（含 403 时钟偏差自愈：按服务端 Date 重试一次）。
 * @returns Promise<Buffer>，失败 reject（调用方负责降级）
 */
function synthesize(text, voice) {
  return synthesizeOnce(text, voice, 0).catch(e => {
    const date = e && e.responseHeaders && e.responseHeaders.date;
    const is403 = /HTTP 403/.test(String(e && e.message || ''));
    if (!is403 || !date) throw e;
    const serverSec = Math.floor(new Date(date).getTime() / 1000);
    if (!Number.isFinite(serverSec)) throw e;
    const skew = serverSec - Math.floor(Date.now() / 1000);
    console.error('[edge-tts] 握手 403，按服务端时钟校准', skew, '秒后重试一次');
    return synthesizeOnce(text, voice, skew);
  });
}

module.exports = { synthesize, _internals: { sha256Init, sha256Digest, cs64Digest, secMsGecV2 } };
