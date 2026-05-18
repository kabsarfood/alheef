# بناء وتشغيل موقع الهيف (Node + Express)
FROM node:20-bookworm-slim

WORKDIR /app

# مكتبات نظام لـ sharp (ضغط الصور) — اختياري لكن يمنع فشل التثبيت على بعض السيرفرات
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libvips42 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# تثبيت الاعتماديات (sharp اختياري — لا يوقف البناء إن فشل)
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY server.js ./
COPY server ./server
COPY public ./public
COPY dashboard ./dashboard

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
