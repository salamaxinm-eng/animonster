# Точечная доработка технического SEO — 30 октября 2026

Изменения реализованы в `codex/animonster-pass` от `991dc2ce7fd3eb41a7d03aa629728302906c80fe`. После fetch remote main оставалась на `2e6e7c4ec41b993f9471662761a267f08854a54a`. Использованы AGENTS.md и документация установленного Next.js 16.3.6 (generate-metadata, sitemap, headers, notFound); проверено итоговое наследование robots/googlebot по HTML.

**Деплой и merge в main не выполнялись.** Локальная production-сборка проверена отдельно от действующего сайта. Предсуществующее изменение `app/legal/[document]/page.tsx` сохранено без изменений; SHA-256 до и после: `4CD91F63F29F2D0518BE9E4039B452E7DE71C7AB66E1E16C291AA6933C8EAA4A`. Этот файл не входит в SEO-изменения.

## Было → исправлено → проверено

| Было / наблюдение | Реализовано в коде | Подтверждено локально |
|---|---|---|
| `/genres/Исэкай` перенаправлял в noindex-поиск; у тем не было самостоятельной выдачи | `/themes/{тема}`: SSR из БД, Title/Description/H1, содержательный вводный текст и количество тайтлов, self-canonical, JSON-LD, ссылки на карточки и пагинация | Исекай и Школа; в синтетической таксономии также Магия. Страница 2 получает другой срез; alias/старый genre URL дают 308 на один канонический адрес |
| Синонимы «Исекай» / «Исэкай», варианты регистра могли создавать разные адреса | Один нормализованный URL `/themes/Исекай`, нормализация регистра/пробелов/ё; ссылки из `/themes` и карточек ведут на новые адреса | SQL-тест объединяет оба написания без дублей; HTML содержит обычные ссылки и self-canonical |
| Общее представление задачи о «Магии» отличалось от текущей таксономии | Существующий жанр не дублируется темой | На production Магия — жанр: `/genres/Магия` = 200, self-canonical, 16 ссылок на тайтлы в исходном HTML. API facets: 53 темы, есть Исэкай и Школа; Магия отсутствует среди тем. Отдельный тест проверяет приоритет классификации жанра |
| Profile/classic, reset-password и другие служебные страницы наследовали index от корня; Disallow мешал прочитать новое noindex | Общие robots и googleBot noindex, X-Robots-Tag; разрешено чтение страницы ботами в robots.txt | Профиль/classic, закладки, загрузки, комнаты, QR, подтверждение почты, browse и публичные профили проверены по HTML/заголовкам |
| Публичные `/members/...` отдают в SSR в основном клиентскую оболочку, без полноценного уникального профиля | `noindex, follow`; доступность и приватность профиля не менялись | Заглушка публичного профиля не наследует index; в sitemap её нет. Возможное возвращение в индекс требует отдельного SSR-проекта с проверкой содержательности |
| Reset-password с фиктивным токеном на живом сайте: index/googlebot index, s-maxage, strict-origin-when-cross-origin | Token routes: dynamic, no-store, no-referrer, noindex. OAuth/referral redirects также защищены заголовками; обработчики авторизации не менялись | Reset-password с фиктивным токеном = 200, robots/googlebot noindex, private no-store, no-referrer. Реальные токены не использовались |
| Код Metrika передавал location.search и сырой referrer; исключение было только для QR | Фильтр чувствительных маршрутов/параметров; безопасные hit/referrer; удаление счётчика при переходе на чувствительный маршрут. Webvisor и автоматический trackLinks выключены для предотвращения фоновой отправки URL | Unit-тесты на token/access_token/state/QR/приватные комнаты; на чувствительной странице нет кода счётчика в исходном HTML. Трафик в реальный счётчик не отправлялся |
| Серии и озвучки изначально были пусты и появлялись после JS-запроса | Видимый SSR-блок из точных карт/поэпизодного кэша Kodik; только названия и номера, без media/player URL. Plus помечен; неизвестный доступ не считается бесплатным; для 18+ и ограничений региона данные не раскрываются | Разреженная карта 1 и 3 не превращается в 1–999; устаревшая запись серии 2 не заполняет пробел в новой карте. В HTML есть SEO Studio, ссылки на серии 1/3 и отметка Plus; прямых медиассылок нет |
| H1 главной зависел от первого слайда; при пустой подборке пропадал | Постоянный видимый H1 «Смотреть аниме онлайн на AniMonster», все слайды H2; сохранены селекторы оформления/мобильные правила | По одному H1 в HTML с непустой и пустой БД; заголовки слайдов H2, исходные hero-правила распространены на них без повышения специфичности |
| JSON-LD сортировки fresh содержал URL с sort, canonical его удалял | URL в JSON-LD совпадает с canonical; варианты сортировки/дополнительных фильтров noindex | Каталог fresh page=2, обычная пагинация, фильтр темы; googlebot не противоречит robots |
| Sitemap ловил ошибку БД и отдавал 200 с четырьмя адресами. В живом sitemap были 6 ID из списка ограничений | Ошибка БД распространяется как 5xx; добавлены только непустые канонические темы. Исключены глобально и регионально ограниченные тайтлы по основному/альтернативным ID; правила доступа сохранены | Локальный sitemap: 69 URL, без дублей и служебных/query URL; все 7 выбранных карточек/жанров/тем = 200 без редиректов, self-canonical, без noindex. Из живого sitemap проверены 55825 и 60058: оба = 451, noindex |

Обычный SSR каталога/жанров, существующая пагинация, canonical карточки в том числе при `?episode=`, серверные initialRelations и noindex поиска сохранены. Индексируемые темы создаются только из реально присутствующей локальной классификации с тайтлами; произвольные комбинации и поиск не индексируются. Отдельные страницы эпизодов не создавались.

## Команды и результаты

- `node --test --test-concurrency=1 tests/seo.test.mjs tests/anime-taxonomy.test.mjs tests/catalog-identity.test.mjs tests/title-restrictions.test.mjs tests/title-restriction-admin.test.mjs tests/kodik-voiceovers.test.mjs tests/kodik-player-route.test.mjs tests/qr-login.test.mjs tests/email.test.mjs tests/sitemap.test.mjs` — **53 passed, 0 failed**. После дополнительной проверки приоритета жанра повторён `tests/seo.test.mjs`: **17 passed**.
- `oxlint <изменённые ts/tsx/mjs>` — exit 0, без диагностик. Юридическая страница исключена из набора изменений.
- `npm run build` — exit 0; финальный запуск compiled 8.3s, TypeScript 8.5s. Собран установленный Next 16.3.6, standalone runtime запускался на 127.0.0.1:3130.
- `node scripts/seo-http-audit.mjs http://127.0.0.1:3130 work/seo-20261030/verified-yandex --assert --fixture` — **35 основных URL + 7 выборочных URL sitemap, 0 failures**, без JS.
- Та же команда с `--agent=Googlebot` и отдельной папкой — **35 + 7 URL, 0 failures**, без JS. Прогоны выполнялись последовательно.
- Имитация SQL-ошибки в отдельной фикстуре (переименование колонки, затем восстановление), аудит `--assert --outage` — главная, каталог, Исекай, sitemap: **4 ответа 500**.
- Пустая локальная подборка, аудит `--assert --empty-home` — **200 и один постоянный H1**, 0 failures.
- `git diff --check` для SEO-файлов — exit 0.

Основные URL HTTP-проверки: `/`, `/catalog`, `/catalog?page=2`, `/catalog?sort=fresh&page=2`, обычный жанр, темы/синонимы/страница 2, несуществующие и избыточные страницы, `/anime/21?episode=3`, поиск, profile/classic, reset-password с фиктивным токеном, QR, загрузки, комнаты, публичный профиль, browse, рекомендации, robots и sitemap. Проверялись статус, цепочка и конечный URL, canonical, robots/googlebot и заголовки, H1, HTML-ссылки, серверные сведения о сериях, JSON-LD.

Фикстура: `node scripts/seo-fixture.mjs .data/<новая-папка>` создаёт отдельную БД из миграций, 60 синтетических тайтлов и 0 пользователей. Реальная БД не копировалась. TCP-адаптер `@electric-sql/pglite-socket@0.2.11` установлен только внутри ignored work, package.json/lockfile проекта не менялись. Сервер требует загрузки pg_trgm, как и исходная БД. [Официальное описание адаптера](https://github.com/electric-sql/pglite/blob/main/packages/pglite-socket/README.md) отмечает ограничения его мультиплексора; параллельный прогон двух агентов был отброшен из-за смешивания prepared statements. Приведённые успешные результаты получены последовательно, не путём изменения production DB-кода.

## Что подтверждено на действующем сайте

Выполнены только анонимные GET без cookies, JS, POST, авторизации и отправки уведомлений. Новый код туда не развёртывался.

Живые каталог/пагинация/жанр и canonical `/anime/21?episode=3` уже работают. Поиск уже имеет robots noindex. H1 главной всё ещё «Ван-Пис»; отдельных новых страниц тем нет; profile/classic и reset-password ещё наследуют index. Живой sitemap содержит 8832 URL и не включает новую каноническую страницу Исекай. В нём присутствуют 6 записей из списка ограничений; отдельные GET 55825 и 60058 вернули 451/noindex. Рабочий жанр Магия подтверждён отдельно и сохраняется.

[Сводные машиночитаемые доказательства](seo-evidence-2026-10-30.json) содержат отдельно production и локальные результаты. Полные raw HTML и подробные логи находятся локально в `work/seo-20261030/`; они не коммитились. Полный sitemap действующего сайта не обходился: проверена структура всего списка и ограниченная выборка адресов, а не все 8832 страницы.

## Ограничения

- Новая реализация подтверждена на локальной production-сборке с синтетической БД. Реальные новые SSR-страницы и заголовки после деплоя ещё не проверялись; нагрузка SQL на полном production-каталоге не измерялась.
- Серверный блок — снимок подтверждённого кэша, не обещание текущего воспроизведения. Доступ по возрасту, региону и Plus остаётся за плеером/API. При отсутствии точных данных это явно сообщается. Показывается до 200 номеров с явной подписью, если подтверждено больше.
- Для данных доступности в SSR не вызывается провайдер; полнота зависит от штатного наполнения кэша. Приватные медиассылки и персональные данные в блок не передаются.
- Фильтр аналитики проверен в коде/тестах и по HTML; реальные сетевые события внешнего счётчика не отправлялись. Реальные ссылки сброса пароля, OAuth и токены не использовались.
- Визуальная проверка на физических устройствах и полные нагрузочные/браузерные E2E не проводились. Стили hero и их адаптивные правила сохранены; источник H1 проверен отдельно при пустой выдаче.

## Файлы SEO-изменения

- `app/admin/layout.tsx`
- `app/anime/[id]/page.tsx`
- `app/auth/layout.tsx`
- `app/auth/qr/page.tsx`
- `app/bookmarks/layout.tsx`
- `app/browse/layout.tsx`
- `app/catalog/page.tsx`
- `app/community.css`
- `app/downloads/layout.tsx`
- `app/eclipse.css`
- `app/genres/[genre]/page.tsx`
- `app/globals.css`
- `app/members/layout.tsx`
- `app/page.tsx`
- `app/passport/layout.tsx`
- `app/plus/layout.tsx`
- `app/profile/layout.tsx`
- `app/referrals/layout.tsx`
- `app/reset-password/layout.tsx`
- `app/robots.ts`
- `app/search/layout.tsx`
- `app/sitemap.ts`
- `app/themes/[theme]/page.tsx`
- `app/themes/page.tsx`
- `app/verify-email/layout.tsx`
- `app/verify-email/page.tsx`
- `app/vpn/layout.tsx`
- `app/vpn/page.tsx`
- `app/watch/[code]/page.tsx`
- `app/watch/layout.tsx`
- `components/anime-page.tsx`
- `components/anime-themes.tsx`
- `components/cached-anime-availability.tsx`
- `components/home-page-client.tsx`
- `components/popular-hero.tsx`
- `components/yandex-metrika.tsx`
- `docs/SEO_TECHNICAL_2026-10-30.md`
- `docs/seo-evidence-2026-10-30.json`
- `lib/anime-taxonomy.ts`
- `lib/seo-policy.ts`
- `lib/seo.ts`
- `lib/server/home.ts`
- `lib/server/library.ts`
- `lib/server/public-anime-availability.ts`
- `lib/server/theme-landings.ts`
- `lib/server/title-restrictions.ts`
- `lib/theme-copy.ts`
- `lib/title-policy.ts`
- `next.config.ts`
- `scripts/seo-fixture.mjs`
- `scripts/seo-http-audit.mjs`
- `tests/catalog-identity.test.mjs`
- `tests/helpers/title-restrictions.mjs`
- `tests/seo.test.mjs`
- `tests/sitemap.test.mjs`
- `tests/title-restriction-admin.test.mjs`
