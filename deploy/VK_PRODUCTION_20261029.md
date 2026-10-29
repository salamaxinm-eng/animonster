# ВК-бот на действующем сайте — 29 октября 2026

**Текущий выпуск интерфейса:** `363ee82`, образ `animonster-app:ux-363ee82`; актуальная конфигурация и откат описаны в [UX_NOTIFICATIONS_ACHIEVEMENTS_20261029.md](UX_NOTIFICATIONS_ACHIEVEMENTS_20261029.md). Упоминания образов ниже относятся к предыдущим выпускам.

**Последующее обновление:** быстрый переход по кнопке выпущен в `beefce5`; текущий образ `animonster-app:vk-easy-beefce5`. Детали и актуальный откат: [VK_EASY_CONNECT_20261029.md](VK_EASY_CONNECT_20261029.md). Ниже описан первоначальный запуск.

После получения рабочего SSH-доступа выполнен production-выпуск на `177.3.218.227`. ВК-бот сообщества `animonster1` подключён к основному `https://animonster.su`.

## Выпуск и сохранение конфигурации

- Код: `84e4a44`, ветка `codex/animonster-pass`.
- Проверенный образ со staging перенесён между серверами без повторной сборки на production: `animonster-app:vk-84e4a44`, digest `sha256:d24a453cb81b08bc5dc2a6aaace3c4e5222c4bde36dbb22ca4b024e89e48a8a8`.
- До изменения БД сохранён `/root/animonster-vk-live/database-before.dump`, 120 143 192 байта; доступ только root. Dump не копировался в Git.
- Применена только добавочная миграция `0071_vk_notifications.sql`; данные аккаунтов и платежей не удалялись.
- Проверочный контейнер на loopback 3112 проверил главную, каталог и page=2, жанры, аниме 21, player-demo, health, sitemap, robots (все 200), секрет callback и пустую очередь. После успешного выпуска canary удалён.
- Исходные env-файлы и Compose-файлы сохранены без изменений, проверены контрольные суммы. Авторизация, платежи и параметры медиадемо в runtime сохранены; bind и read-only медиамонтирование совпадают с прежними.
- Секреты ВК находятся в новом закрытом `/root/animonster-vk-live/production-vk.env` (0600); файл содержит только VK_BOT_* и не включён в образ или репозиторий. В исходном production `.env` изменений нет.
- Контейнер `animonster-app-1` healthy, публичный `/api/health` возвращает `{"status":"ok"}`.

Текущий Compose использует исходный project `animonster`, исходные три конфигурационных файла из `/root/animonster-release-player-features-20261025` и дополнительный последний override `/root/animonster-vk-live/compose.vk.yaml`. В этом override закреплён текущий image и добавлен env-файл ВК. При дальнейших выпусках нужно сохранять этот env-overlay и обновлять закреплённый image, иначе можно случайно вернуть прежний образ или потерять настройки бота. Полные исходные аргументы отката сохранены в приватном `/root/animonster-vk-live/rollback-command.json`.

## Подключение сообщества

- Сообщество: `241950462`, https://vk.ru/animonster1.
- Новый Callback server ID **2**, URL `https://animonster.su/api/vk-notifications/callback`, status **ok** по ответу самого VK API.
- Включены `message_new`, `message_allow`, `message_deny`, версия API 5.199.
- Прежний сервер ID 1 и существующий Long Poll не изменялись.
- Публичная проверка confirmation дала точную confirmation string, неверный секрет не принимается.
- Личная привязка выполняется через профиль → настройки → уведомления → «Подключить ВК». Команду пользователь сам отправляет сообществу.

## Автоматическая обработка

Установлен `animonster-vk-worker.timer`, доставка каждую минуту. Endpoint `/api/internal/vk-notifications` защищён прежним runtime `RECOMMENDATION_CRON_SECRET`. Новый приватный файл `/root/animonster-vk-live/.env.production` содержит только эту переменную для worker-скриптов; исходный env приложения не перезаписывался. Unit override задаёт `ANIMONSTER_APP_DIR=/root/animonster-vk-live`.

Восстановлен штатный `animonster-kodik-sync.timer` раз в пять минут: соответствующий флаг приложения уже был true, но unit отсутствовал на сервере. Первое обновление успешно: incremental, 16 импортированных записей, 425 обновлённых, 59 пропущенных штатной проверкой; initial_complete=true. Следующий запуск также успешен. Это источник обновлений серий для очереди; доставка ВК выполняется отдельным таймером.

Рабочая проверка зафиксировала **одну реальную привязку и одно приветственное сообщение в status=sent**. Событие прошло через production callback и очередь, VK API подтвердил отправку. Искусственные события новых серий и сообщения другим людям ради теста не создавались. Отображение сообщения/системного баннера на личном устройстве подтверждает получатель.

## Telegram: отдельный результат проверки

На действующем сервере не найден `animonster-plus-worker.service`. В `telegram_deliveries` находятся 12 исторических sent (последний 4 октября) и 16 pending от 14 сентября; pending не соответствуют действующим разрешённым подпискам (join дал 0 готовых получателей). Старый Plus/Telegram worker не запускался, старая Telegram-очередь не рассылалась. Восстановление Telegram-расписания и устранение зависания sending остаются отдельной задачей. Эти данные не подменяются результатом успешной отправки ВК.

## Проверка и откат

```sh
docker inspect animonster-app-1 --format '{{.State.Health.Status}} {{.Config.Image}}'
systemctl list-timers --all | grep -E 'animonster-vk-worker|animonster-kodik-sync'
journalctl -u animonster-vk-worker.service -n 20 --no-pager
journalctl -u animonster-kodik-sync.service -n 20 --no-pager
```

Агрегаты доставки без личных данных:

```sql
SELECT status,count(*) FROM vk_bot_outbox GROUP BY status;
SELECT count(*) FROM vk_bot_accounts WHERE vk_user_id IS NOT NULL AND disabled_at IS NULL;
```

При необходимости отката: остановить отдельный таймер ВК, отключить его Callback server 2 (не менять другие интеграции), выполнить сохранённую исходную Compose-команду из rollback-command.json. Прежний `animonster-app:seo-f596fd5` сохранён. Новые таблицы можно оставить; автоматическое восстановление/разрушительный откат БД не требуется.

После загрузки образа удалён только временный архив переноса на production, сам образ и резервная копия сохранены. Свободно около 5.1 GiB; диск уже был заполнен на 95% до выпуска, поэтому за ростом медиаданных и резервных копий следует наблюдать отдельно.
