# Исток легенды

Персональная постоянная награда: тег `legend-origin`, переливающийся золотой ник, пожизненный AniMonster Plus. Выдача сама по себе не создаёт платежей или мест Founder и не меняет рейтинги. Золотой ник определяется серверным `users.legend_origin_at` и сохраняется при смене активного тега. Пожизненный статус публичного профиля определяется действующим lifetime-грантом, а не номером Founder.

## Выпуск

Образ `animonster-app:legend-origin-20261026`. Предыдущий образ `animonster-app:admin-mobile-20261026` сохранён. Применить только `0063_legend_origin.sql` после резервной копии. Затем проверить canary, переключить только Compose app с `--no-deps`, выдать награды отдельным скриптом:

```sh
psql -v ON_ERROR_STOP=1 -v owner_id=72a2651c-ee22-48e2-8a2e-eaf81d83e332 -v recipient_id=3c199d52-d4c1-48f3-8051-83ccbe5f00a5 -f scripts/grant-legend-origin.sql
```

Запускать с существующим подключением к PostgreSQL, не помещать секреты в команду или Git. Скрипт проверяет владельца-администратора и существование получателя, выдаёт обоим инвентарь и lifetime-гранты, экипирует новый тег при первой выдаче и записывает аудит. Повторный запуск не дублирует награды, не меняет выбранный позднее тег и не сбрасывает просмотр благодарности.

`GET /api/rewards/legend-origin` возвращает статус только текущего аккаунта; не помечает награду просмотренной. `POST` проверяет Origin и userId текущей сессии, отмечает только свой аккаунт; повтор не меняет первую дату. На следующем открытии сайта после авторизации показывается благодарность. Отметка сохраняется на сервере при закрытии, поэтому не повторяется на другом устройстве. При сбое сохранения остаётся кнопка повтора. Данные просмотра не включены в публичный профиль. Анимация ждёт видимой вкладки, выхода из fullscreen и закрытия других диалогов; поддерживает prefers-reduced-motion.

## Изображение

Итоговый файл: `public/rewards/legend-origin/tag-v1.png` (2171×724, PNG с alpha). Подготовлен встроенным image_gen, режим background-extraction, из приложенного пользователем рисунка. Полный промпт:

> Use case: background-extraction. Edit target: attached pixel-art badge. Remove only the plain white background outside the decorative badge, creating actual alpha transparency. Preserve exactly the original gold flames, black/purple interior, infinity symbol, crown, all ornaments and Russian lettering "ИСТОК ЛЕГЕНДЫ". Do not redraw, restyle, reword, crop decorations, or add anything. Keep the same wide aspect ratio, complete entire badge visible with minimal transparent padding. This is a production website reward tag. Save the resulting transparent PNG.

## Проверки выпуска

215 тестов, TypeScript и lint прошли. Продакшен-образ `3f788bab8df5`. Реальный HTTP-canary проверил пожизненный статус публичного профиля, доступность тега получателю, золотой маркер в комментариях, приватность и повторяемость GET, защиту POST от CSRF и смены аккаунта, однократное подтверждение и совместимость рейтингов/админки/демоплеера. Временные аккаунты и их гранты удалены. Перед миграцией создана резервная копия БД; предыдущий образ сохранён. Визуальная проверка анимации в браузере не выполнялась.
