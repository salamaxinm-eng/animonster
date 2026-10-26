export const NICKNAME_PRICE = 5000;
export const nicknameColors = [
  ['coral', 'Коралл', '#ff8f9c', '#ffd0bc'],
  ['scarlet', 'Алый', '#ff8595', '#ffc1d1'],
  ['rose', 'Роза', '#ffa1cd', '#ffd0e8'],
  ['fuchsia', 'Фуксия', '#ef9df5', '#ffd0fa'],
  ['peach', 'Персик', '#ffb78d', '#ffe4c4'],
  ['tangerine', 'Мандарин', '#ffa56f', '#ffd7ae'],
  ['lemon', 'Лимон', '#e9e88c', '#ffffd0'],
  ['lime', 'Лайм', '#c2ed87', '#ecffc7'],
  ['mint', 'Мята', '#8fe5bd', '#d2ffea'],
  ['emerald', 'Изумруд', '#75dbb0', '#b8fce3'],
  ['jade', 'Нефрит', '#84d7c9', '#bfffee'],
  ['turquoise', 'Бирюза', '#75deed', '#c9fbff'],
  ['ice', 'Лёд', '#b2e7ff', '#effaff'],
  ['sky', 'Небо', '#8bc9ff', '#d4eaff'],
  ['azure', 'Лазурь', '#9cb5ff', '#d3ddff'],
  ['lavender', 'Лаванда', '#c1aeff', '#e6deff'],
  ['violet', 'Аметист', '#d6a1ff', '#efdbff'],
  ['lilac', 'Сирень', '#e1b5ef', '#ffe1ff'],
  ['silver', 'Серебро', '#c7d3e8', '#f8fbff'],
  ['pearl', 'Жемчуг', '#eee1e4', '#ffffff'],
] as const;
export const nicknameEffects = [
  ['solid', 'Обычный цвет'],
  ['gradient', 'Градиент'],
  ['shimmer', 'Переливание'],
  ['neon', 'Неон'],
  ['metal', 'Металлический блеск'],
  ['stars', 'Звёздные искры'],
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
