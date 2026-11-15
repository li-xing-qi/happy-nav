// agent-bot：一个进程跑三个场景（聊天室 / 卡牌 / 五子棋）
//
// 为什么合并：三个独立进程各占 65~90MB（主要是 Node 运行时 + 模型客户端），
// 合并后共享一份，省约 140MB。
//
// 每个场景独立运行、独立 try-catch：
// 一个挂了不影响另外两个，日志带前缀方便排查。
const core = require('./core.js');

const log = core.makeLogger('main');

// 场景开关：可以单独关掉某个场景调试
const ENABLE = {
  chat: process.env.NO_CHAT !== '1',
  card: process.env.NO_CARD !== '1',
  gomoku: process.env.NO_GOMOKU !== '1',
  lingxi: process.env.NO_LINGXI !== '1',
};

const scenes = [];

function load(name) {
  try {
    return require(`./scenes/${name}.js`);
  } catch (e) {
    log(`加载场景 ${name} 失败:`, e.message);
    return null;
  }
}

async function main() {
  log('agent-bot 启动，人设长度', core.persona().length, '字');
  log('启用的场景:', Object.entries(ENABLE).filter(([, v]) => v).map(([k]) => k).join(', '));

  /* 房号就是访问凭证：知道号码就能进。默认值（0000 / main）人人会猜，
   * 局域网或组网环境里等于敞着门，所以这里提醒一次。 */
  const cfgRooms = require('./config.js').rooms;
  const guessed = [];
  if (ENABLE.chat && cfgRooms.chat === '0000') guessed.push('CHAT_ROOM');
  if (ENABLE.card && cfgRooms.card === 'main') guessed.push('CARD_ROOM');
  if (ENABLE.gomoku && cfgRooms.gomoku === '0000') guessed.push('GOMOKU_ROOM');
  if (guessed.length) {
    log(`提示：${guessed.join(' / ')} 仍是默认值。房号即凭证，建议改成不容易猜的（改 .env 即可）`);
  }

  for (const name of ['chat', 'card', 'gomoku', 'lingxi']) {
    if (!ENABLE[name]) {
      log(`跳过场景 ${name}（已禁用）`);
      continue;
    }
    const mod = load(name);
    if (!mod || typeof mod.start !== 'function') {
      log(`场景 ${name} 没有 start() 导出，跳过`);
      continue;
    }
    scenes.push({ name, mod });
    // 每个场景异步启动，不阻塞别人
    Promise.resolve()
      .then(() => mod.start())
      .catch((e) => log(`场景 ${name} 启动失败:`, e?.message || e));
  }

  if (!scenes.length) {
    log('没有可用场景，退出');
    process.exit(1);
  }
  log(`已启动 ${scenes.length} 个场景`);
}

// 兜底：任何未捕获的异常只记日志，不让进程退出
process.on('unhandledRejection', (e) => {
  log('未捕获的 Promise 异常:', e?.message || e);
});
process.on('uncaughtException', (e) => {
  log('未捕获的异常:', e?.message || e);
  // 严重错误（比如端口被占）还是退出，让 pm2 重启
  if (e && /EADDRINUSE|ENOENT/.test(String(e.code))) process.exit(1);
});

// 优雅退出
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`收到 ${sig}，退出`);
    process.exit(0);
  });
}

main().catch((e) => {
  log('启动失败:', e?.message || e);
  process.exit(1);
});
