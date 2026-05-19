FROM node:18-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# package.json فقط — يتجنب فشل npm ci عند تعارض lockfile
COPY package.json ./

RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY server.js ./
COPY server ./server
COPY public ./public
COPY dashboard ./dashboard

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
