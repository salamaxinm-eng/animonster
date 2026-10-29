import type { PublicAnimeAvailability } from '@/lib/server/public-anime-availability';

export function CachedAnimeAvailability({
  animeId,
  data,
}: {
  animeId: number;
  data: PublicAnimeAvailability;
}) {
  return (
    <section
      className="cached-anime-availability"
      aria-labelledby="cached-availability-heading"
    >
      <h2 id="cached-availability-heading">Подтверждённые серии и озвучки</h2>
      {data.status !== 'cached' ? (
        <p>
          {data.status === 'age-restricted'
            ? 'Сведения о просмотре доступны в плеере после подтверждения возраста.'
            : 'Сведения о просмотре недоступны в вашем регионе.'}
        </p>
      ) : (
        <>
          <p>
            Сведения из локального кэша
            {data.updatedAt
              ? ` от ${new Date(data.updatedAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}`
              : ''}
            . Фактический доступ проверяется в плеере.
          </p>
          {data.voiceovers.length > 0 && (
            <>
              <h3>Озвучки и субтитры</h3>
              <ul>
                {data.voiceovers.map((voice, index) => (
                  <li key={voice.type + ':' + index}>
                    {voice.title} ·{' '}
                    {voice.type === 'subtitles' ? 'субтитры' : 'озвучка'}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.total > 0 ? (
            <>
              <p>
                Подтверждено серий: {data.total}.
                {data.total > data.episodes.length
                  ? ` Ниже показаны первые ${data.episodes.length}.`
                  : ''}
              </p>
              <ol className="cached-episode-list">
                {data.episodes.map((episode) => (
                  <li key={episode.ordinal}>
                    <a
                      href={`/anime/${animeId}?episode=${episode.ordinal}#watch`}
                    >
                      Серия {episode.ordinal}
                    </a>
                    <span>
                      {' '}
                      —{' '}
                      {episode.access === 'plus'
                        ? 'ранний доступ Plus'
                        : episode.access === 'free'
                          ? 'без раннего ограничения Plus'
                          : 'условия доступа уточняются в плеере'}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
              Точный список серий ещё не подтверждён в кэше. Проверьте
              актуальную информацию в плеере.
            </p>
          )}
        </>
      )}
    </section>
  );
}
