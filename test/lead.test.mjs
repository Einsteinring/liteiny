/**
 * Тесты обработчика заявок. Запуск: node --test test/lead.test.mjs
 *
 * Telegram здесь не дёргается: все проверяемые ветки возвращают ответ
 * раньше, чем дело доходит до отправки, либо fetch подменён заглушкой.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/lead.js';

/** Минимальный двойник res из Vercel: копит статус, тело и заголовки. */
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    }
  };
  return res;
}

function makeReq({ method = 'POST', body = {}, origin } = {}) {
  return { method, body, headers: origin ? { origin } : {} };
}

const VALID = {
  name: 'Игорь',
  phone: '+7 921 111-22-33',
  question: 'Управляющий оспаривает платежи по поставке, заседание через три недели.'
};

test('чужой метод получает 405 и заголовок Allow', async () => {
  const res = makeRes();
  await handler(makeReq({ method: 'GET' }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(res.body.ok, false);
});

test('запрос с чужого адреса отклоняется', async () => {
  const res = makeRes();
  await handler(makeReq({ body: VALID, origin: 'https://example.com' }), res);

  assert.equal(res.statusCode, 403);
});

test('свой адрес проходит проверку origin', async () => {
  const res = makeRes();
  await handler(makeReq({ body: { ...VALID, company: 'ООО Спам' }, origin: 'https://liteiny.vercel.app' }), res);

  // Ловушка сработала раньше отправки, значит origin возражений не вызвал.
  assert.equal(res.statusCode, 200);
});

test('заполненная ловушка даёт успех, но ничего не отправляет', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('сюда дойти не должны');
  };

  try {
    const res = makeRes();
    await handler(makeReq({ body: { ...VALID, company: 'ООО Спам' } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('короткое имя, короткий вопрос и телефон без цифр не проходят', async () => {
  const cases = [
    [{ ...VALID, name: 'И' }, 'name'],
    [{ ...VALID, question: 'мало' }, 'question'],
    [{ ...VALID, phone: '+7 (000' }, 'phone'],
    [{ ...VALID, phone: '123456789' }, 'phone']
  ];

  for (const [body, field] of cases) {
    const res = makeRes();
    await handler(makeReq({ body }), res);

    assert.equal(res.statusCode, 400, `ожидали 400 для поля ${field}`);
    assert.ok(res.body.fields.includes(field), `в ответе нет поля ${field}`);
  }
});

test('слишком длинный вопрос отсекается', async () => {
  const res = makeRes();
  await handler(makeReq({ body: { ...VALID, question: 'а'.repeat(2001) } }), res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes('question'));
});

test('тело строкой разбирается как JSON', async () => {
  const res = makeRes();
  await handler(makeReq({ body: JSON.stringify({ ...VALID, company: 'бот' }) }), res);

  assert.equal(res.statusCode, 200);
});

test('без переменных окружения отвечаем 502, а не падаем', async () => {
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  try {
    const res = makeRes();
    await handler(makeReq({ body: VALID }), res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, false);
  } finally {
    if (savedToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat !== undefined) process.env.TELEGRAM_CHAT_ID = savedChat;
  }
});

test('корректная заявка уходит в Telegram с экранированным текстом', async () => {
  const realFetch = globalThis.fetch;
  let sent = null;

  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '42';

  globalThis.fetch = async (url, options) => {
    sent = { url, payload: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  try {
    const res = makeRes();
    await handler(makeReq({ body: { ...VALID, name: 'Игорь <b>' } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(sent.payload.chat_id, '42');
    assert.equal(sent.payload.parse_mode, 'HTML');
    assert.ok(sent.payload.text.includes('Игорь &lt;b&gt;'), 'разметка из поля не экранирована');
    assert.ok(!sent.payload.text.includes('Игорь <b>'), 'сырой тег попал в сообщение');
    assert.ok(sent.payload.text.includes('+7 921 111-22-33'));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});

test('ошибка Telegram превращается в 502 без токена в ответе', async () => {
  const realFetch = globalThis.fetch;

  process.env.TELEGRAM_BOT_TOKEN = 'secret-token-value';
  process.env.TELEGRAM_CHAT_ID = '42';

  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });

  try {
    const res = makeRes();
    await handler(makeReq({ body: VALID }), res);

    assert.equal(res.statusCode, 502);
    assert.ok(!JSON.stringify(res.body).includes('secret-token-value'));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});
