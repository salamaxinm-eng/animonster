# AniMonster Plus: запуск на сервере

1. Выполнить миграции и пересобрать приложение:

   ```sh
   cd /root/animonster
   npm run db:migrate
   docker compose up -d --build
   ```

2. Скопировать воркер и unit-файлы:

   ```sh
   install -m 0755 deploy/animonster-plus-worker /usr/local/bin/animonster-plus-worker
   install -m 0644 deploy/animonster-plus-worker.service /etc/systemd/system/
   install -m 0644 deploy/animonster-plus-worker.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now animonster-plus-worker.timer
   systemctl start animonster-plus-worker.service
   journalctl -u animonster-plus-worker.service -n 50 --no-pager
   ```

3. Настроить Telegram webhook после заполнения переменных бота:

   ```sh
   set -a
   . /root/animonster/.env.production
   set +a
   curl --fail --show-error --silent \
     "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     --data-urlencode 'url=https://animonster.su/api/telegram/webhook' \
     --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```

`PLUS_EARLY_ACCESS_ENABLED` надо оставить `false` при первом запуске. Первый
успешный запуск воркера пометит уже известные серии как бесплатные. После этого
флаг можно переключить на `true` и перезапустить контейнер приложения.

Платежи остаются выключенными при `PAYMENTS_ENABLED=false`. После подключения
Platega получите `MerchantId` и API-ключ в личном кабинете, добавьте их в
`.env.production` как `PLATEGA_MERCHANT_ID` и `PLATEGA_SECRET_KEY`, укажите
`https://animonster.su/api/payments/webhook` в Platega → Настройки → Callback URLs,
затем установите `PAYMENTS_ENABLED=true` и пересоздайте приложение. Callback
принимается только с корректными заголовками Platega; подтверждение Plus
дополнительно проверяется запросом статуса транзакции к API Platega.
