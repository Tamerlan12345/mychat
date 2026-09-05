# Centras Chat Gateway

Один лёгкий Node-процесс (`server/`), который стоит между клиентами и Supabase. Клиенты — веб и десктоп — знают **только его адрес**; ключи проекта живут на сервере.

```
клиент ──HTTPS/WSS──▶ gateway ──▶ Supabase (PostgREST · Auth · Storage · Realtime)
                          │
                          ├── /api/v1/bootstrap, /healthz, /readyz
                          ├── /api/v1/integrations/messages   (бот, bearer-токен)
                          ├── /api/v1/admin/outbox[/…/retry]   (администраторы, JWT)
                          ├── /api/telegram/*                  (релей + внутренний планировщик)
                          └── integration_outbox → коннекторы (webhook с HMAC)
```

## Как это работает

- **Прозрачный прокси.** `/rest/v1/*`, `/auth/v1/*`, `/storage/v1/*`, `/functions/v1/*` и WebSocket `/realtime/v1/*` пересылаются в Supabase. Шлюз подставляет `apikey` (anon-ключ) и, если клиент не прислал свой JWT, `Authorization: Bearer <anon>`. JWT пользователя проходит без изменений — **RLS работает как прежде**. Клиентская библиотека создаётся с адресом шлюза и ключом-заглушкой `gateway` (`lib/provider/supabase-client.ts`).
- **Нет ключей в клиенте.** Установщик и веб-сборка получают только `NEXT_PUBLIC_SERVER_URL` (или сотрудник вводит адрес в диалоге «Сервер → Изменить» на экране входа). Прямой режим Supabase (URL + anon key) остался в «Расширенных параметрах» для инсталляций без шлюза.
- **Событийная шина.** Триггеры в Postgres пишут в `integration_outbox` (`message.created` с упоминаниями, `member.added/removed`). Диспетчер шлюза забирает пачки через `claim_outbox_batch()` (лизинг, `FOR UPDATE SKIP LOCKED`), отдаёт коннекторам и отмечает `complete_outbox()` / `fail_outbox()` с экспоненциальным откатом (5 с → 10 мин, 8 попыток, затем `dead`). Всё через `SECURITY DEFINER`-функции, доступные только `service_role`.
- **Webhook-коннектор** — единственный встроенный потребитель: `POST OUTBOX_WEBHOOK_URL` с телом `{id, type, occurred_at, attempt, data}` и заголовками `X-Centras-Event-Id`, `X-Centras-Event-Type`, `X-Centras-Timestamp`, `X-Centras-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`. Любая система (в том числе n8n, если он появится) подписывается именно так.
- **Интеграционный бот.** `POST /api/v1/integrations/messages` с `Authorization: Bearer $INTEGRATION_BOT_TOKEN` и `{conversation_id, content}` публикует сообщение от профиля `INTEGRATION_BOT_USER_ID` (заведите сотрудника «Система»).
- **Telegram-релей** переехал из внешнего cron: воркер запускается внутри шлюза каждые `TELEGRAM_WORKER_INTERVAL_MS`; маршруты `/api/telegram/*` — те же обработчики, что и у Next.js (общий код `lib/telegram/*`).

## Запуск

```bash
cp .env.server.example .env.server      # заполнить SUPABASE_*, при необходимости бота и вебхук
docker compose up -d                    # gateway + caddy (TLS от Let's Encrypt для GATEWAY_DOMAIN)
curl https://chat.company.kz/healthz    # {"status":"ok",...}
curl https://chat.company.kz/readyz     # проверяет доступность Supabase
```

Без Docker: `npm run server:build && npm run server:start` (переменные окружения — те же). Windows-сервер: обернуть `node dist-server/index.js` в NSSM.

Миграции: применить `supabase/migrations/004_conversations_overview.sql` и `005_integration_outbox.sql` (см. `docs/SUPABASE_SETUP.md`).

## Клиент

| Переменная / поле | Режим |
|-------------------|-------|
| `NEXT_PUBLIC_SERVER_URL=https://chat.company.kz` | шлюз (рекомендуется) — ключей в сборке нет |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | прямое подключение к Supabase |
| ничего | демо-режим (in-memory) |

В десктопе введённый адрес хранится в DPAPI-хранилище, в вебе — в `localStorage`; «Проверить» в диалоге дергает `/healthz` шлюза.

## Проверка

- `npm run server:typecheck`, `npm test` (тесты шлюза: маршруты, прокси, диспетчер, HMAC, конфиг).
- Смоук против заглушки Supabase: шлюз подставляет ключ в заголовок и query, сохраняет JWT пользователя, отдаёт `content-range`, закрывает бот-эндпоинт без токена (401).
- Админка → «Интеграции»: очередь `integration_outbox`, статусы, ошибки доставки, ручной повтор.

## Эксплуатация

- Логи без текстов сообщений; `/readyz` для оркестратора; `cleanup_outbox(14)` запускается ежедневно.
- Секреты только в `.env.server` (в `.gitignore`); ротация — перезапуск контейнера.
- `MIN_CLIENT_VERSION` в `bootstrap` — для будущей проверки версии клиента.
