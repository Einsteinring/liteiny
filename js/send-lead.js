/**
 * Отправка заявки с формы записи на консультацию.
 *
 * Сейчас бэкенда нет: функция логирует заявку в консоль и возвращает
 * успех с пометкой demo. Когда обработчик появится, достаточно вписать
 * его адрес в ENDPOINT — остальной код менять не придётся.
 */

const ENDPOINT = ''; // например '/api/lead' или адрес формы на стороннем сервисе
const TIMEOUT_MS = 10000;

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
    page: location.pathname,
    sentAt: new Date().toISOString()
  };

  if (!payload.name || !payload.phone || !payload.question) {
    throw new LeadError('В заявке не хватает имени, телефона или вопроса.');
  }

  // Демо-режим: показываем, что именно ушло бы на сервер.
  if (!ENDPOINT) {
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
      throw new LeadError(`Сервер ответил ${response.status}.`);
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
