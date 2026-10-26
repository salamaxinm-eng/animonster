export const NICKNAME_PRICE = 5000;
export const nicknameColors = [
  ['coral', 'Коралл', '#ff597d', '#ffe2ac', '#ff8b3d'],
  ['scarlet', 'Алый', '#ff466e', '#fff0c2', '#ff7650'],
  ['rose', 'Роза', '#ff65bb', '#ffe6f4', '#c569ff'],
  ['fuchsia', 'Фуксия', '#ee59ff', '#ffc8fc', '#8b7bff'],
  ['peach', 'Персик', '#ff9b72', '#fff0b8', '#ff6289'],
  ['tangerine', 'Мандарин', '#ff9a3d', '#fff3af', '#ff526f'],
  ['lemon', 'Лимон', '#f4ef54', '#ffffe2', '#a9f26a'],
  ['lime', 'Лайм', '#b4f44c', '#f1ffb7', '#3fffc7'],
  ['mint', 'Мята', '#52f4b8', '#d8fff0', '#66dfff'],
  ['emerald', 'Изумруд', '#3ce69b', '#c2ffd8', '#37d9d9'],
  ['jade', 'Нефрит', '#3de1cc', '#d9fff4', '#70acff'],
  ['turquoise', 'Бирюза', '#3fe5ff', '#e7ffff', '#7b9dff'],
  ['ice', 'Лёд', '#8ceaff', '#ffffff', '#9f9bff'],
  ['sky', 'Небо', '#58c8ff', '#dff5ff', '#6e8cff'],
  ['azure', 'Лазурь', '#799eff', '#e0eaff', '#ba7dff'],
  ['lavender', 'Лаванда', '#b295ff', '#f0e6ff', '#ed81ff'],
  ['violet', 'Аметист', '#cc7bff', '#f9e6ff', '#799dff'],
  ['lilac', 'Сирень', '#ed91ea', '#ffe4fb', '#9d8aff'],
  ['silver', 'Серебро', '#bdd8f4', '#ffffff', '#88a9ff'],
  ['pearl', 'Жемчуг', '#f9daec', '#ffffff', '#9fe9f4'],
] as const;
export const nicknameEffects = [
  ['solid', 'Насыщенный цвет'],
  ['gradient', 'Призма'],
  ['shimmer', 'Северное сияние'],
  ['neon', 'Неоновый импульс'],
  ['metal', 'Жидкий хром'],
  ['stars', 'Звёздная пыль'],
] as const;
export type NicknameStyle = { color: string; effect: string; motion: boolean };
export function validNicknameStyle(value: unknown): value is NicknameStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as NicknameStyle;
  return (
    typeof s.motion === 'boolean' &&
    (s.color === 'default' ||
      s.color === 'legend' ||
      nicknameColors.some((c) => c[0] === s.color)) &&
    nicknameEffects.some((e) => e[0] === s.effect)
  );
}
