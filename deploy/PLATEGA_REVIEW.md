# Подготовка AniMonster к проверке Platega

Публичные страницы для проверки доступны без авторизации:

- сайт: `https://animonster.su`
- политика конфиденциальности: `https://animonster.su/legal/privacy`
- пользовательское соглашение: `https://animonster.su/legal/terms`
- публичная оферта AniMonster Plus: `https://animonster.su/legal/offer`
- цены и тарифы: `https://animonster.su/legal/prices`
- поддержка: `https://animonster.su/legal/support`
- реквизиты продавца: `https://animonster.su/legal/requisites`

На странице AniMonster Plus временно показывается кодовое слово `Platega test`.
Удалите его после завершения согласования и регистрации кассы.

Тариф для пользователя: AniMonster Plus, 30 дней, 89 ₽, ручное продление без
автоматических списаний. Комиссия платёжного провайдера не добавляется к цене,
показанной пользователю. Способы оплаты отображаются на форме Platega согласно
подключённому магазину.

## После выдачи доступов Platega

Добавьте `MerchantId` и API-ключ только в `/root/animonster/.env.production`:

```dotenv
PLATEGA_MERCHANT_ID=значение_из_личного_кабинета
PLATEGA_SECRET_KEY=секретный_API_ключ
PAYMENTS_ENABLED=true
```

В Platega укажите callback URL `https://animonster.su/api/payments/webhook`.
Затем примените миграцию и пересоздайте приложение:

```sh
cd /root/animonster
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d --build app
```

Не добавляйте секрет в Git, публичные сообщения или Telegram. Если для первичной
проверки Platega выдал тестовые доступы, используйте только их и не выдавайте
боевые Plus по одному факту возврата пользователя с платёжной страницы.
