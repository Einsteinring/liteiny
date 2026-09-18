/**
 * Отправка заявки с формы записи на консультацию.
 *
 * Заявка уходит в serverless-функцию api/lead.js на том же домене, а та
 * пересылает её в Telegram. Токен бота живёт в переменных окружения Vercel
 * и на страницу никогда не попадает.
 *
 * Локально (python -m http.server) функции нет, поэтому на localhost
 * работает демо-режим: заявка печатается в консоль.
 */

const ENDPOINT = '/api/lead';
const TIMEOUT_MS = 10000;
const DEMO_HOSTS = ['localhost', '127.0.0.1', ''];

/** Ошибка отправки: её ловит форма и показывает человеку. */
export class LeadError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LeadError';
    this.cause = cause;
  }
}

/**
 * @param {{name: string, phone: string, question: string}} data
 * @returns {Promise<{ok: true, mode: 'demo' | 'sent'}>}
 * @throws {LeadError}
 */
export async function sendLead(data) {
  const payload = {
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    question: String(data.question || '').trim(),
    // Ловушка для ботов: у человека это поле пустое.
    company: String(data.company || '')
  };

  if (!payload.name || !payload.phone || !payload.question) {
    throw new LeadError('В заявке не хватает имени, телефона или вопроса.');
  }

  // Демо-режим для локального запуска: показываем, что ушло бы на сервер.
  if (!ENDPOINT || DEMO_HOSTS.includes(location.hostname)) {
    console.info('[sendLead] заявка (демо-режим, ничего не отправлено):', payload);
    await wait(500);
    return { ok: true, mode: 'demo' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const reason = await response.json().catch(() => null);
      throw new LeadError(reason?.error ? `${reason.error}.` : `Сервер ответил ${response.status}.`);
    }

    return { ok: true, mode: 'sent' };
  } catch (error) {
    if (error instanceof LeadError) throw error;
    if (error.name === 'AbortError') {
      throw new LeadError('Сервер не ответил за десять секунд.', error);
    }
    throw new LeadError('Не удалось связаться с сервером.', error);
  } finally {
    clearTimeout(timer);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
