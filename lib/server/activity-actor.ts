import { viewer, cookie, hash, uid } from './core';

export async function actor(r: Request) {
  const user = await viewer(r),
    supplied = cookie(r, 'am_visitor');
  const visitor = /^[a-f0-9-]{36}$/.test(supplied) ? supplied : uid();
  return {
    user,
    visitor,
    key: user ? 'u:' + user.id : 'v:' + (await hash(visitor)),
  };
}
