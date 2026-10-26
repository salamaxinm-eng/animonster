# Sitemap: исправление HTTP 500

Образ: `animonster-app:sitemap-fix-20261026`. Предыдущий: `animonster-app:legend-origin-focus-20261026`. Миграций и изменений БД нет.

`anime_cache.updated_at` — bigint в миллисекундах. PostgreSQL-драйвер отдаёт его строкой; `new Date(string)` не интерпретирует такую строку как Unix timestamp. Next вызывает toISOString при сериализации метаданных уже после возврата из sitemap(), поэтому существующий try/catch не перехватывал RangeError: Invalid time value и `/sitemap.xml` возвращал 500. Исправлено явным Number и проверкой конечности/диапазона даты. Некорректная дата пропускается, URL сохраняется. Ограничение 50 000 URL учитывает четыре статические страницы.

Регрессионные проверки используют настоящий resolveSitemap из установленного Next: строковые bigint, числовые даты, некорректные значения, лимит и fallback при сбое БД. В canary на реальной БД проверить HTTP 200, Content-Type XML, корень urlset, число loc = число тайтлов + четыре статические страницы и валидность lastmod. После переключения app с --no-deps проверить публичный `/sitemap.xml`, HEAD и запросы с User-Agent Googlebot / YandexBot, ссылку в `/robots.txt`.

Проверка выпуска: три регрессионных теста, TypeScript, lint и production build прошли. Образ `d6c1cabc856c`. Canary вернул HTTP 200, XML размером 1 392 871 байт: 8 784 уникальных URL и 8 780 корректных lastmod; HEAD с Googlebot и YandexBot также 200. Временный контейнер удалён.
