/**
 * Приём заявки с формы записи и пересылка в Telegram.
 *
 * Зачем серверная функция: сайт статический, весь его код открыт для чтения.
 * Токен бота в таком коде равносилен выложенному паролю — любой сможет писать
 * от имени бота. Здесь токен живёт в переменных окружения Vercel.
 *
 *   браузер  →  POST /api/lead  →  Telegram Bot API  →  чат бюро
 *                 токен здесь
 *
 * Переменные окружения:
 *   TELEGRAM_BOT_TOKEN — токен от @BotFather
 *   TELEGRAM_CHAT_ID   — куда слать заявки
 *   ALLOWED_ORIGINS    — необязательно, адреса через запятую
 */

const DEFAULT_ORIGINS = [
  "https://liteiny.vercel.app",
  "https://liteiny-einsteinring.vercel.app",
  "http://localhost:5178",
  "http://127.0.0.1:5178",
];

const LIMITS = {
  name: { min: 2, max: 80 },
  phone: { min: 5, max: 40 },
  question: { min: 10, max: 2000 },
};

const MIN_PHONE_DIGITS = 10;

function allowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ORIGINS;
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Экранируем то, что уйдёт в Telegram с parse_mode HTML. */
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function validate(data) {
  const invalid = [];

  for (const [field, rule] of Object.entries(LIMITS)) {
    const length = data[field].length;
    if (length < rule.min || length > rule.max) invalid.push(field);
  }

  if (!invalid.includes("phone") && data.phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) {
    invalid.push("phone");
  }

  return invalid;
}

function buildMessage(data) {
  const when = new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    "<b>Заявка с сайта «Литейный»</b>\n\n" +
    `<b>Имя:</b> ${esc(data.name)}\n` +
    `<b>Телефон:</b> <code>${esc(data.phone)}</code>\n\n` +
    `${esc(data.question)}\n\n` +
    `<i>${esc(when)} МСК</i>`
  );
}

async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    // Ответ Telegram может содержать токен в описании ошибки — целиком не логируем.
    throw new Error("Telegram ответил " + response.status);
  }

  return response.json();
}

export default async function handler(req, res) {
  res.setHeader("Vary", "Origin");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Метод не поддерживается" });
    return;
  }

  // Форма лежит на том же домене, поэтому чужой Origin — это не наш посетитель.
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().includes(origin)) {
    res.status(403).json({ ok: false, error: "Запрос с чужого адреса" });
    return;
  }

  const body = readBody(req);

  // Ловушка для ботов: человек этого поля не видит и не заполняет.
  // Отвечаем успехом, чтобы бот не искал обход.
  if (clean(body.company)) {
    res.status(200).json({ ok: true });
    return;
  }

  const data = {
    name: clean(body.name),
    phone: clean(body.phone),
    question: clean(body.question),
  };

  const invalid = validate(data);
  if (invalid.length) {
    res.status(400).json({ ok: false, error: "Проверьте поля", fields: invalid });
    return;
  }

  try {
    await sendToTelegram(buildMessage(data));
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[lead] заявка не ушла:", error.message);
    res.status(502).json({ ok: false, error: "Не удалось доставить заявку" });
  }
}
