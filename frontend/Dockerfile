# ATS Wallet — Next.js frontend (для Coolify / Docker)
# Переменная NEXT_PUBLIC_API_BACKEND — URL бэкенда для rewrites (внутри сети: http://backend:4000)

# Этап 1: сборка
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Внутри Docker Compose бэкенд доступен как backend:4000 (задаётся через build-arg или env при деплое)
ARG NEXT_PUBLIC_API_BACKEND=http://backend:4000
ENV NEXT_PUBLIC_API_BACKEND=${NEXT_PUBLIC_API_BACKEND}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Этап 2: образ для запуска (standalone)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN chown -R nextjs:nodejs /app/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
