'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BuySubscription } from './buy-subscription';
import { GlobalSearch } from '@/components/global-search';
import { EmailForm } from './email-form';
import { Input } from '@/components/ui/input';
import {
  Ghost,
  Bell,
  Gem,
  ArrowLeft,
  MessageCircle,
  UsersRound,
} from 'lucide-react';
import { pins, avatars, themes, type Profile } from '@/lib/community';
export async function api(action: string, data?: Record<string, unknown>) {
  const r = await fetch(
    data ? '/api/community' : '/api/community?action=' + action,
    {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify({ action, ...data }) : undefined,
    },
  );
  if (r.status === 204) return null;
  const result = (await r.json()) as any;
  if (!r.ok) throw Error(result.error || 'Не удалось загрузить данные');
  return result;
}
const Context = createContext<{
  user: Profile | null;
  preview: boolean;
  moderator: boolean;
  vkReady: boolean;
  inviteRequired: boolean;
  emailVerificationRequired: boolean;
  paymentsReady: boolean;
  supportUrl: string | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  login: () => void;
}>({
  user: null,
  preview: false,
  moderator: false,
  vkReady: false,
  inviteRequired: false,
  emailVerificationRequired: false,
  paymentsReady: false,
  supportUrl: null,
  loaded: false,
  refresh: async () => {},
  login: () => {},
});
export const useCommunity = () => useContext(Context);
export function CommunityProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState({
      user: null as Profile | null,
      preview: false,
      moderator: false,
      vk_ready: false,
      invite_required: false,
      email_verification_required: false,
      payments_ready: false,
      support_url: null as string | null,
    }),
    [loaded, setLoaded] = useState(false),
    [showLogin, setShowLogin] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setMe(await api('me'));
    } catch {
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    void fetch('/api/activity', { method: 'POST' });
  }, [refresh]);
  useEffect(() => {
    if (!me.user) return;
    let legacy: any[] = [];
    try {
      legacy = JSON.parse(localStorage.getItem('animonster-list') || '[]');
    } catch {}
    if (!legacy.length) return;
    void (async () => {
      try {
        const profile = await api('profile');
        for (const a of legacy) {
          if (
            !a?.id ||
            !a.image?.original ||
            profile.entries.some((e: any) => e.anime_id === a.id)
          )
            continue;
          await api('collection', {
            anime_id: a.id,
            title: a.russian || a.name,
            image: a.image.original.startsWith('https://')
              ? a.image.original
              : 'https://shikimori.one' + a.image.original,
            status: 'planned',
          });
        }
        localStorage.removeItem('animonster-list');
        await refresh();
      } catch {}
    })();
  }, [me.user?.id]);
  return (
    <Context.Provider
      value={{
        user: me.user,
        preview: me.preview,
        moderator: me.moderator,
        vkReady: me.vk_ready,
        inviteRequired: me.invite_required,
        emailVerificationRequired: me.email_verification_required,
        paymentsReady: me.payments_ready,
        supportUrl: me.support_url,
        loaded,
        refresh,
        login: () => setShowLogin(true),
      }}
    >
      {children}
      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="sign-dialog">
          <Ghost size={40} color="#b4ed50" />
          <DialogTitle>Твой мир на AniMonster</DialogTitle>
          <DialogDescription>
            Сохраняй историю, собирай коллекцию и обсуждай серии.
          </DialogDescription>
          {me.vk_ready ? (
            <form
              className="vk-login-form vk-login-primary"
              action="/api/auth/vk"
              method="get"
              target="_top"
            >
              <strong>Основной способ входа</strong>
              {me.invite_required && (
                <Input
                  name="invite"
                  placeholder="Инвайт для первого входа"
                  required
                  minLength={8}
                  maxLength={64}
                />
              )}
              <button className="vk-button" type="submit">
                Войти через VK ID
              </button>
            </form>
          ) : (
            <p className="setup-note">
              Вход через VK скоро появится. Сейчас приложение VK ID ещё не
              подключено.
            </p>
          )}
          <details className="email-alternative" open={!me.vk_ready}>
            <summary>Войти по email и паролю</summary>
            <EmailForm
              inviteRequired={me.invite_required}
              onSuccess={async () => {
                await refresh();
                setShowLogin(false);
              }}
            />
          </details>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export function Pin({ id }: { id: string | null }) {
  const referralPins = [
    {
      id: 'referral-scout',
      name: 'Искатель',
      label: 'Реферальная награда',
      image: '/pins/referral-scout.svg',
    },
    {
      id: 'referral-crew',
      name: 'Команда',
      label: 'Реферальная награда',
      image: '/pins/referral-crew.svg',
    },
    {
      id: 'referral-master-pin',
      name: 'Капитан',
      label: 'Реферальная награда',
      image: '/pins/referral-master.svg',
    },
    {
      id: 'referral-legend',
      name: 'Легендарный проводник',
      label: 'Реферальная награда',
      image: '/pins/referral-legend.svg',
    },
  ];
  const p = [...pins, ...referralPins].find((item) => item.id === id);
  return p ? (
    <span
      className="anime-pin"
      title={p.name + ' · ' + p.label}
      aria-label={p.name + ' · ' + p.label}
    >
      <img src={p.image} alt="" />
    </span>
  ) : null;
}
const tagLabels: Record<string, string> = {
  plus: 'PLUS',
  supporter: 'Поддержал AniMonster',
  'hundred-episodes': 'Сотня серий',
  'binge-watcher': 'Запойный зритель',
  'animonster-legend': 'Легенда AniMonster',
  mugiwara: 'Мугивара',
  recruiter: 'Вербовщик',
};
export function UserTag({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <span className={`user-tag user-tag-${id}`} title="Тег пользователя">
      {tagLabels[id] || id.replaceAll('-', ' ')}
    </span>
  );
}
export function Avatar({
  avatar = 'moon',
  theme = 'neon',
  large = false,
}: {
  avatar?: string;
  theme?: string;
  large?: boolean;
}) {
  const custom = avatar.match(/^custom:([a-f0-9-]{36}):(\d+)$/i);
  return (
    <span
      className={'user-avatar ' + (large ? 'large' : '')}
      style={{ borderColor: themes.find((t) => t.id === theme)?.color }}
    >
      <img
        src={
          custom
            ? `/api/avatar/${encodeURIComponent(custom[1])}?v=${custom[2]}`
            : '/hero.png'
        }
        style={{
          objectPosition: custom
            ? 'center'
            : avatars.find((a) => a.id === avatar)?.position,
        }}
        alt="Аватар"
      />
    </span>
  );
}
export function AccountNav() {
  const c = useCommunity();
  const [activeParty, setActiveParty] = useState<{
    code: string;
    anime_title: string;
    episode: number;
  } | null>(null);
  useEffect(() => {
    if (!c.user) {
      setActiveParty(null);
      return;
    }
    void fetch('/api/watch-parties')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => setActiveParty(result?.active || null))
      .catch(() => {});
  }, [c.user?.id]);
  return (
    <div className="account-nav">
      {activeParty && (
        <a
          href={`/watch/${activeParty.code}`}
          className="active-party-link"
          title={`${activeParty.anime_title} · серия ${activeParty.episode}`}
        >
          <UsersRound size={16} /> Вернуться в комнату
        </a>
      )}
      <a href="/referrals" className="referral-nav-button">
        <Gem size={16} /> Пригласить друзей
      </a>
      <a href="/pins" className="plus-link">
        <Gem size={17} /> Пины
      </a>
      <BuySubscription className="subscription-nav" />
      {c.moderator && <a href="/admin">Админка</a>}
      {c.user ? (
        <>
          <a className="account-link" href="/profile">
            <Avatar avatar={c.user.avatar} theme={c.user.theme} />
            <span>{c.user.nick}</span>
          </a>
          {c.emailVerificationRequired && !c.user.email_verified && (
            <span className="verify-email-label">Подтвердите email</span>
          )}
          <a href="/profile?tab=notifications" aria-label="Уведомления">
            <Bell size={18} />
          </a>
          {c.preview ? (
            <span className="preview-label">Предпросмотр</span>
          ) : (
            <button
              className="text-link"
              onClick={async () => {
                await api('logout', {});
                await c.refresh();
              }}
            >
              Выйти
            </button>
          )}
        </>
      ) : (
        <button className="vk-mini" onClick={c.login}>
          Войти
        </button>
      )}
    </div>
  );
}
export function CommunityHeader() {
  const community = useCommunity();
  return (
    <header className="community-header">
      <a href="/" className="brand">
        <Ghost size={26} />
        <span>
          Ani<span>Monster</span>
        </span>
      </a>
      <nav className="community-links" aria-label="Основные разделы">
        <a className="back-catalog" href="/#catalog">
          <ArrowLeft size={16} /> Каталог
        </a>
        <a className="back-catalog" href="/genres">
          Жанры
        </a>
        <a className="back-catalog" href="/recommendations">
          Рекомендации
        </a>
      </nav>
      <GlobalSearch />
      <AccountNav />
      {community.supportUrl && (
        <a
          className="support-link"
          href={community.supportUrl}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={17} /> Поддержка
        </a>
      )}
    </header>
  );
}
