// 安全的 HTML 截图：把模型写的 HTML 渲染成 PNG
//
// 为什么单独一个脚本（而不是内联在 Node 里）：
//   puppeteer 启动了 Chromium 子进程，放到独立脚本里更好隔离、超时也好控制。
//
// 安全限制（模型写的 HTML 不能全信）：
//   只放行 file:// 与 data:，其余请求一律 abort —— 防止它偷偷联网、
//   拉外部图片、甚至探测内网。
//
// 用法：node shot-safe.mjs <html路径> <输出png> <宽> <高>
// 依赖：puppeteer-core + 一个 Chromium/Chrome 可执行文件（用 CHROME_BIN 指定）
import puppeteer from 'puppeteer-core';

const exe = process.env.CHROME_BIN
  || '/usr/bin/chromium'
  || '/usr/bin/google-chrome';

const htmlPath = process.argv[2];
const out = process.argv[3] || '/tmp/out.png';
const width = Number(process.argv[4] || 800);
const height = Number(process.argv[5] || 600);

if (!htmlPath) {
  console.log(JSON.stringify({ ok: false, error: '缺少 HTML 路径参数' }));
  process.exit(1);
}

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--disable-web-security',
      '--disable-features=NetworkService',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  // 关键：只放行 file:// / data: / about:，其余全部掐断
  await page.setRequestInterception(true);
  const blocked = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('about:')) {
      req.continue();
    } else {
      blocked.push(u.slice(0, 120));
      req.abort();
    }
  });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle2', timeout: 12000 });
  await new Promise((r) => setTimeout(r, 400));

  await page.screenshot({ path: out, fullPage: false });
  console.log(JSON.stringify({ ok: true, blocked: blocked.slice(0, 5) }, null, 0));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
