# Вход через Google и Telegram

Добавлены OIDC Authorization Code Flow с PKCE и привязка в **Профиль → Настройки → Аккаунт → Способы входа**. Оба способа работают через переход в основном окне браузера, без popup/iframe. Существующие email/пароль и VK остаются.

## Google (в том числе Gmail)

В Google Cloud Console / Google Auth Platform создайте OAuth client типа **Web application**, настройте название AniMonster, домен, контакты и экран согласия. Если приложение в режиме Testing, добавьте тестовых пользователей; для общего доступа переведите в Production в консоли Google.

Authorized redirect URI, строго без завершающего слеша:

```text
https://animonster.su/api/auth/google/callback
```

Если консоль запрашивает origin сайта:

```text
https://animonster.su
```

Полученные значения добавьте в `.env.production` на сервере:

```dotenv
GOOGLE_CLIENT_ID=client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=client-secret
```

Запрашиваются только `openid email profile`. Доступ к письмам Gmail не запрашивается, Gmail API включать не требуется. Поддерживаются обычные Google accounts и Gmail. Проверяется подпись ID token, issuer, audience/authorized party, время действия, nonce и подтверждение email.

## Telegram

Откройте mini app **@BotFather**, выберите бота → **Login Widget**. Можно использовать существующего бота AniMonster. В **Allowed URLs** добавьте origin сайта и callback:

```text
https://animonster.su
https://animonster.su/api/auth/telegram/callback
```

Скопируйте Client ID и Client Secret из настроек Login Widget:

```dotenv
TELEGRAM_LOGIN_CLIENT_ID=client-id-from-botfather
TELEGRAM_LOGIN_CLIENT_SECRET=client-secret-from-botfather
```

Оставьте алгоритм подписи **RS256**. Это новые credentials Telegram Login / OIDC. **Bot token не является Client Secret**. Переменные `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` и `TELEGRAM_WEBHOOK_SECRET` относятся к существующему боту уведомлений; заменять их не нужно.

Запрашиваются `openid profile`; телефон и разрешение боту писать пользователю не запрашиваются. Уведомления подключаются отдельно существующим способом. Вход сверяет числовой Telegram user ID из подписанного профиля с `telegram_accounts`. Если пользователь уже подключил уведомления, открывается существующий профиль. OIDC `sub` хранится отдельно: его нельзя считать Telegram user/chat ID. Перепривязка уведомлений к другому профилю при занятой Telegram login identity отклоняется.

## Настройки окружения

```dotenv
SITE_URL=https://animonster.su
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TELEGRAM_LOGIN_CLIENT_ID=
TELEGRAM_LOGIN_CLIENT_SECRET=
```

Client Secret храните только в серверном `.env.production`. Не используйте `NEXT_PUBLIC_*`, не коммитьте настоящие ключи и не присылайте их в чат. Пока ID/Secret провайдера не заданы, соответствующая кнопка видна как недоступная с пояснением. Достаточно настроить один способ; второй можно включить позже.

## Аккаунты и совместимость

### Публичные ссылки VK и Telegram

В **Профиль → Настройки → Приватность → Социальные сети** пользователь может указать ссылки на VK и Telegram и отдельно включить их показ. Это пользовательские ссылки, а не подтверждение владения аккаунтом. Они не меняют привязки для входа или уведомлений. По умолчанию обе скрыты; скрытые адреса возвращаются только владельцу для редактирования. Публичный API возвращает `null` вместо скрытого адреса. Допускаются только адреса профилей на `vk.com` и `t.me`, без параметров, ссылок-приглашений и посторонних доменов.

Для этой настройки нужна дополнительная миграция `0059_profile_social_visibility.sql` (четыре поля в `users`, без изменения старых аккаунтов). Перед обновлением приложения выполните существующий сервис `migrate`, как в инструкции ниже. Новых переменных окружения не требуется.

- Новые пользователи получают обычную роль `user` и стандартное оформление.
- Google не объединяет аккаунты только по совпадению email. Если email уже занят, нужно сначала войти привычным способом, затем явно подключить Google в настройках этого профиля. Так не теряются история, покупки и оформление.
- Привязка требует той же активной AniMonster-сессии на старте и при возврате, а также на момент записи в базу. Переключение аккаунта или выход во время привязки отменяет её.
- На профиль можно подключить по одному аккаунту каждого провайдера. Один внешний аккаунт не может принадлежать двум профилям. Автоматического переноса и слияния нет; отключение входов в этом изменении не добавлено.
- Инвайт требуется только для нового пользователя, если включён `INVITE_REQUIRED`. Он расходуется атомарно в одной транзакции с созданием пользователя и identity.
- Существующие блокировки/удаление аккаунта сохраняются. Реферальная привязка применяется только при создании нового пользователя.
- Access/refresh/ID tokens не сохраняются. Сессия использует существующую cookie `am_session`; OAuth state/browser binding/nonce истекают через 10 минут и используются один раз. Секреты и токены в ошибки не выводятся.
- Новые попытки OAuth ограничены через PostgreSQL `auth_limits`; решения о владельце Telegram и identity сериализуются транзакционными advisory locks.

## Обновление production

Изменение требует **миграцию `0058_social_login.sql`**: добавляются поля к `auth_flows` и `auth_identities`, старые записи и VK flows сохраняются. Миграция не пересоздаёт таблицы и не удаляет данные.

После публикации изменений в Git, из чистого checkout на сервере:

```sh
git status --short
git rev-parse HEAD
git fetch origin
# Если сервер на main, а изменения опубликованы в codex/animonster-pass:
git merge --ff-only origin/codex/animonster-pass

# Сначала сохраните резервную копию БД принятым на сервере способом.
# Заполните четыре credentials и проверьте SITE_URL в .env.production.
docker compose --env-file .env.production run --rm --build migrate
docker compose --env-file .env.production up -d --build --no-deps app
docker compose --env-file .env.production logs --tail=100 app
```

Если есть отдельный app worker, после миграции на узле БД обновите приложение и env также на worker, используя принятый `compose.app-node.yaml`. Все обслуживающие сайт экземпляры должны получить одинаковые credentials и SITE_URL. Пересборка статического клиента ради ключей не требуется, но контейнер нужно пересоздать, чтобы он прочитал env.

После обновления проверьте Google/Telegram с новым пользователем, повторный вход в тот же профиль, существующую Telegram-привязку уведомлений, привязку из настроек, отмену у провайдера, email/пароль и VK. Реальные внешние logins требуют настроенных credentials и разрешённых callback URL; их нельзя проверить до настройки приложений у провайдеров.

## Проверки разработчика

```sh
node --test tests/social-auth.test.mjs
node --test --test-concurrency=2 tests/*.test.mjs
npx tsc --noEmit
npm run build
```

Тесты используют настоящую проверку JWT через `jose` и тестовые RSA-ключи, изолированную PostgreSQL/PGlite с миграциями, подмену внешнего HTTP. Они проверяют claims/signature, PKCE/state/cookie, replay, исходную сессию привязки, приглашения и гонки, роли/блокировки, дубли email, сохранение профиля, существующую Telegram-привязку и webhook.

Результат локальной проверки: 188/188 тестов, TypeScript, production build и lint файлов функции проходят. Общий lint содержит существующие ошибки в `lib/server/vpn.ts`, `components/community/profile-page.tsx` и старых тестах. Интерфейс проверен через Playwright в настольном Chromium, Android/Chromium и iPhone/WebKit (эмуляция). Внешние переходы и HTTP провайдеров в тестах подменены; проверку с реальными Google/Telegram аккаунтами необходимо выполнить после регистрации OAuth clients и настройки credentials.

Официальная документация: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Telegram Login / OIDC](https://core.telegram.org/bots/telegram-login).
