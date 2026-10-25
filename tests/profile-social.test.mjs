import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(
  await readFile('lib/profile-social.ts', 'utf8'),
);
const { profileSocialUrl, publicProfileSocial } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('hidden social links never enter public profiles; owner can edit them', () => {
  const user = {
    vk_url: 'https://vk.com/id12345',
    telegram_url: 'https://t.me/test_user',
    show_vk: 0,
    show_telegram: 0,
  };
  assert.deepEqual(publicProfileSocial(user), {
    vk_url: null,
    telegram_url: null,
    show_vk: 0,
    show_telegram: 0,
  });
  assert.equal(publicProfileSocial(user, true).telegram_url, user.telegram_url);
  assert.equal(
    publicProfileSocial({ ...user, show_vk: 1 }).vk_url,
    user.vk_url,
  );
  assert.equal(publicProfileSocial({ ...user, show_vk: 1 }).telegram_url, null);
  assert.equal(publicProfileSocial({ ...user, show_telegram: 1 }).vk_url, null);
  assert.equal(
    publicProfileSocial({ ...user, show_telegram: 1 }).telegram_url,
    user.telegram_url,
  );
  assert.equal(publicProfileSocial({}).vk_url, null);
  assert.equal(
    publicProfileSocial({ vk_url: 'javascript:alert(1)', show_vk: 1 }).vk_url,
    null,
  );
});

test('social profile addresses are canonical and reject unsafe or non-profile links', () => {
  assert.equal(
    profileSocialUrl(' http://m.vk.com/id12345/ ', 'vk'),
    'https://vk.com/id12345',
  );
  assert.equal(
    profileSocialUrl('t.me/test_user', 'telegram'),
    'https://t.me/test_user',
  );
  assert.equal(profileSocialUrl(' ', 'vk'), null);
  for (const [value, provider] of [
    ['javascript:alert(1)', 'vk'],
    ['https://vk.com.evil.com/user', 'vk'],
    ['https://vk.com@evil.com/user', 'vk'],
    ['https://evil.com/user', 'telegram'],
    ['https://t.me/+invite', 'telegram'],
    ['https://t.me/share?url=evil', 'telegram'],
    ['https://t.me/share', 'telegram'],
    ['https://t.me/user_name/123', 'telegram'],
    ['https://vk.com/away?to=evil', 'vk'],
    ['https://vk.com/user#test', 'vk'],
    ['https://t.me:8080/user_name', 'telegram'],
    ['https://name:pass@t.me/user_name', 'telegram'],
    [123, 'vk'],
    ['a'.repeat(201), 'vk'],
  ])
    assert.throws(() => profileSocialUrl(value, provider));
});
