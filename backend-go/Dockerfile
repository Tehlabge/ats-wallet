# ATS Wallet — Go API (для Coolify / Docker)
# Сборка бинарника и запуск в минимальном образе

# Этап 1: сборка
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache ca-certificates
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /ats-wallet-api .

# Этап 2: образ для запуска
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=builder /ats-wallet-api /app/ats-wallet-api

# Логи/файлы пишутся в /app
ENV GIN_MODE=release
EXPOSE 4000

ENTRYPOINT ["/app/ats-wallet-api"]
