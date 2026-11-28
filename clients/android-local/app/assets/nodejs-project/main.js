// App 内嵌 Node 的启动入口：Android 壳把本目录拷到 getFilesDir()/nodejs-project
// 后执行本文件。HOST/PORT 设默认值（server.js 里也各自兜底，双保险），
// 之后一切逻辑都在 server.js —— 与服务器版同一份代码。
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '3000';
require('./server.js');
