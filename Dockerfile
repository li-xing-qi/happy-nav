# 语法只检查，不做构建：这个项目零依赖、纯 Node 内置模块
FROM node:20-alpine

# 时区（聊天记录与记忆时间戳按本地时区更易读，可按需改）
ENV TZ=Asia/Shanghai

WORKDIR /app

# 先只拷清单，利用镜像层缓存
COPY package.json ./

# 项目零第三方依赖，这里不会装任何东西；保留是为了标准流程
RUN npm install --omit=dev --no-audit --no-fund || true

# 站点文件
COPY server.js yu.js lx.js engine.js content.js ./
COPY public ./public
COPY scripts ./scripts

# 运行时数据目录（会被 volume 覆盖）
RUN mkdir -p /app/data/uploads /app/data/chat /app/data/gomoku /app/data/yu /app/data/lx /app/data/yu-files /app/workspace

# 健康检查：命中站点自带的健康接口
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

CMD ["node", "server.js"]
