export const themes = [
  { id: 'neon', name: 'Неон', color: '#b4ed50' },
  { id: 'sakura', name: 'Сакура', color: '#ff94c2' },
  { id: 'mage', name: 'Тёмный маг', color: '#b29aff' },
  { id: 'cyber', name: 'Киберпанк', color: '#65d9ff' },
];
export const avatars = [
  { id: 'moon', name: 'Странница', position: '77% 40%' },
  { id: 'valley', name: 'Долина', position: '20% 50%' },
  { id: 'gate', name: 'Лунный свет', position: '50% 18%' },
];
export const pins = [
  {
    id: 'one-piece',
    name: 'Ван-Пис',
    label: 'Соломенная шляпа',
    image: '/pins/one-piece.png',
  },
  {
    id: 'naruto',
    name: 'Наруто',
    label: 'Повязка шиноби',
    image: '/pins/naruto.png',
  },
  {
    id: 'death-note',
    name: 'Тетрадь смерти',
    label: 'Тетрадь',
    image: '/pins/death-note.png',
  },
  {
    id: 'attack-on-titan',
    name: 'Атака титанов',
    label: 'Крылья свободы',
    image: '/pins/attack-on-titan.png',
  },
  {
    id: 'demon-slayer',
    name: 'Клинок, рассекающий демонов',
    label: 'Клинок пламени',
    image: '/pins/demon-slayer.png',
  },
  {
    id: 'jujutsu-kaisen',
    name: 'Магическая битва',
    label: 'Повязка колдуна',
    image: '/pins/jujutsu-kaisen.png',
  },
  {
    id: 'bleach',
    name: 'Блич',
    label: 'Чёрный меч',
    image: '/pins/bleach.png',
  },
  {
    id: 'dragon-ball',
    name: 'Драконий жемчуг',
    label: 'Четыре звезды',
    image: '/pins/dragon-ball.png',
  },
  {
    id: 'pokemon',
    name: 'Покемон',
    label: 'Покебол',
    image: '/pins/pokemon.png',
  },
  {
    id: 'sailor-moon',
    name: 'Сейлор Мун',
    label: 'Лунный жезл',
    image: '/pins/sailor-moon.png',
  },
  {
    id: 'fullmetal-alchemist',
    name: 'Стальной алхимик',
    label: 'Философский камень',
    image: '/pins/fullmetal-alchemist.png',
  },
  {
    id: 'hunter-x-hunter',
    name: 'Охотник × Охотник',
    label: 'Лицензия охотника',
    image: '/pins/hunter-x-hunter.png',
  },
  {
    id: 'one-punch-man',
    name: 'Ванпанчмен',
    label: 'Красная перчатка',
    image: '/pins/one-punch-man.png',
  },
  {
    id: 'my-hero-academia',
    name: 'Моя геройская академия',
    label: 'Маска героя',
    image: '/pins/my-hero-academia.png',
  },
  {
    id: 'sword-art-online',
    name: 'Мастера Меча Онлайн',
    label: 'Парные мечи',
    image: '/pins/sword-art-online.png',
  },
  {
    id: 'tokyo-ghoul',
    name: 'Токийский гуль',
    label: 'Маска гуля',
    image: '/pins/tokyo-ghoul.png',
  },
  {
    id: 'evangelion',
    name: 'Евангелион',
    label: 'Шлем EVA',
    image: '/pins/evangelion.png',
  },
  {
    id: 'cowboy-bebop',
    name: 'Ковбой Бибоп',
    label: 'Космический истребитель',
    image: '/pins/cowboy-bebop.png',
  },
  {
    id: 'chainsaw-man',
    name: 'Человек-бензопила',
    label: 'Бензопила',
    image: '/pins/chainsaw-man.png',
  },
  {
    id: 'spy-family',
    name: 'Семья шпиона',
    label: 'Плюшевая химера',
    image: '/pins/spy-family.png',
  },
  {
    id: 'frieren',
    name: 'Фрирен',
    label: 'Посох мага',
    image: '/pins/frieren.png',
  },
  {
    id: 'berserk',
    name: 'Берсерк',
    label: 'Меч драконоборца',
    image: '/pins/berserk.png',
  },
  {
    id: 'jojo',
    name: 'ДжоДжо',
    label: 'Золотая стрела',
    image: '/pins/jojo.png',
  },
  {
    id: 'haikyuu',
    name: 'Волейбол!!',
    label: 'Волейбольный мяч',
    image: '/pins/haikyuu.png',
  },
  {
    id: 'blue-lock',
    name: 'Синяя тюрьма',
    label: 'Мяч эгоиста',
    image: '/pins/blue-lock.png',
  },
  {
    id: 'your-name',
    name: 'Твоё имя',
    label: 'Красная нить',
    image: '/pins/your-name.png',
  },
  {
    id: 'spirited-away',
    name: 'Унесённые призраками',
    label: 'Маска духа',
    image: '/pins/spirited-away.png',
  },
  {
    id: 'howl',
    name: 'Ходячий замок',
    label: 'Огонёк',
    image: '/pins/howl.png',
  },
  {
    id: 'mob-psycho-100',
    name: 'Моб Психо 100',
    label: 'Психическая аура',
    image: '/pins/mob-psycho-100.png',
  },
  {
    id: 'vinland-saga',
    name: 'Сага о Винланде',
    label: 'Кинжалы викинга',
    image: '/pins/vinland-saga.png',
  },
];
export type Profile = {
  id: string;
  nick: string;
  bio: string;
  theme: string;
  avatar: string;
  pin: string | null;
  wall_open: number;
  collection_public: number;
  created_at: number;
  premium_until: number;
  adult_confirmed: boolean;
  email_verified: boolean;
  auto_skip_segments: boolean | null;
  level: number;
  profile_background: string | null;
  profile_frame: string;
  entitlements: {
    can_change_avatar: boolean;
    custom_list_limit: number;
    telegram_title_limit: number | null;
    can_customize_lists: boolean;
    can_customize_profile: boolean;
    can_react: boolean;
    early_access: boolean;
  };
};
export type Entry = {
  anime_id: number;
  title: string;
  image: string;
  status: string;
  rating: number;
  favorite: number;
  list_ids: string[];
};
export type CollectionList = {
  id: string;
  name: string;
  item_count: number;
  description: string;
  cover: string | null;
  pinned: number;
};
export const statuses = {
  planned: 'Запланировано',
  watching: 'Смотрю',
  completed: 'Просмотрено',
  dropped: 'Брошено',
};
