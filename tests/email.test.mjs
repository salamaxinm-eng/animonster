import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = (await readFile('lib/server/email.ts', 'utf8')).replace(
  "import { ApiError, runtime } from './core';",
  `class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  const runtime = () => globalThis.emailTestRuntime;`,
);
const { sendMail } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64'),
);

test('Resend receives verification mail with a safe HTML action and plain text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.emailTestRuntime = {
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'AniMonster <no-reply@animonster.su>',
  };
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'mail-id' }), { status: 200 });
  };

  try {
    await sendMail('viewer@example.com', 'Подтвердите email', 'Для AniMonster', {
      label: 'Подтвердить <email>',
      url: 'https://animonster.su/api/auth/email/verify?token=a&next=b',
    });
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer test-key');
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.from, 'AniMonster <no-reply@animonster.su>');
    assert.deepEqual(payload.to, ['viewer@example.com']);
    assert.equal(payload.subject, 'Подтвердите email');
    assert.match(payload.html, /Подтвердить &lt;email&gt;/);
    assert.match(payload.html, /token=a&amp;next=b/);
    assert.match(payload.text, /token=a&next=b/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.emailTestRuntime;
  }
});

test('Resend failure produces a safe delivery error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.emailTestRuntime = { RESEND_API_KEY: 'test-key' };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'private provider details' }), {
      status: 422,
    });

  try {
    await assert.rejects(sendMail('viewer@example.com', 'Test', 'Test'), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'email_delivery_failed');
      assert.doesNotMatch(error.message, /private provider details/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.emailTestRuntime;
  }
});
