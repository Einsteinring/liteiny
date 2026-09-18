import { sendLead, LeadError } from './send-lead.js';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const PHONE = '+7 812 425-18-40';

init();

function init() {
  setDocketDate();
  setupHeader();
  setupMobileNav();
  setupDisclosures();
  setupLeadForm();
  composeDocket();
}

/* ─────────────────── Дата реестра ───────────────────
   Сайт живёт долго, поэтому месяц и год подставляются, а не зашиты. */
function setDocketDate() {
  const node = document.querySelector('[data-docket-date]');
  if (!node) return;

  const now = new Date();
  node.textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  node.setAttribute('datetime', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
}

/* ─────────────────── Шапка ───────────────────
   Одно переключение состояния: полная высота → узкая полоса. */
function setupHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  let ticking = false;

  const update = () => {
    header.dataset.compact = String(window.scrollY > 32);
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  update();
}

/* ─────────────────── Меню на узких экранах ─────────────────── */
function setupMobileNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');
  if (!toggle || !panel) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    toggle.focus();
  });

  window.matchMedia('(min-width: 1080px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

/* ─────────────────── Раскрытие деталей практики ───────────────────
   Класс js-ready включает свёрнутое состояние в CSS. Пока его нет,
   детали видны — если модуль не загрузится, контент не пропадёт. */
function setupDisclosures() {
  const buttons = document.querySelectorAll('.disclosure[aria-controls]');
  if (!buttons.length) return;

  document.documentElement.classList.add('js-ready');

  buttons.forEach((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;

    let cleanup = 0;

    panel.dataset.open = 'false';
    panel.inert = true;

    // По окончании перехода снимаем пиксельную высоту: дальше высотой
    // снова управляет CSS (auto или 0), и контент может переверстаться.
    const release = () => {
      panel.style.height = '';
      clearTimeout(cleanup);
    };

    panel.addEventListener('transitionend', (event) => {
      if (event.target === panel && event.propertyName === 'height') release();
    });

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';

      panel.style.height = `${panel.getBoundingClientRect().height}px`;
      button.setAttribute('aria-expanded', String(open));
      panel.dataset.open = String(open);
      panel.inert = !open;

      const target = open ? panel.scrollHeight : 0;

      requestAnimationFrame(() => {
        panel.style.height = `${target}px`;
      });

      // Страховка: если transitionend не придёт, высота не останется фиксированной.
      clearTimeout(cleanup);
      cleanup = setTimeout(release, 600);
    });
  });
}

/* ─────────────────── Набор реестра при загрузке ───────────────────
   Единственный момент движения, который человек не запускал сам.
   Ждём шрифты, чтобы строки не переверстывались прямо во время анимации. */
function composeDocket() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const start = () => requestAnimationFrame(() => hero.classList.add('is-composed'));
  const fonts = document.fonts && document.fonts.ready;

  if (fonts) {
    Promise.race([fonts, wait(900)]).then(start);
  } else {
    start();
  }
}

/* ─────────────────── Форма записи ─────────────────── */
function setupLeadForm() {
  const form = document.getElementById('lead-form');
  if (!form) return;

  const block = form.closest('.contacts__form');
  const success = document.querySelector('[data-form-success]');
  const failure = form.querySelector('[data-form-failure]');
  const submit = form.querySelector('[data-submit]');
  const resetButton = document.querySelector('[data-form-reset]');
  const submitLabel = submit.textContent;

  const rules = {
    name: (value) => {
      if (!value.trim()) return 'Напишите, как к вам обращаться.';
      if (value.trim().length < 2) return 'Слишком коротко — нужно хотя бы два символа.';
      return '';
    },
    phone: (value) => {
      if (!value.trim()) return 'Без телефона мы не сможем перезвонить.';
      if (value.replace(/\D/g, '').length < 10) return 'В номере не хватает цифр — нужно не меньше десяти.';
      return '';
    },
    question: (value) => {
      if (!value.trim()) return 'Опишите вопрос хотя бы одним предложением.';
      if (value.trim().length < 10) return 'Пары слов мало: напишите, что произошло и на какой стадии.';
      return '';
    }
  };

  const showError = (field, message) => {
    const input = form.elements[field];
    const box = form.querySelector(`[data-error-for="${field}"]`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    box.textContent = message;
    box.hidden = !message;
  };

  Object.keys(rules).forEach((field) => {
    const input = form.elements[field];
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') showError(field, rules[field](input.value));
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) showError(field, rules[field](input.value));
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    failure.hidden = true;

    let firstInvalid = null;

    Object.keys(rules).forEach((field) => {
      const message = rules[field](form.elements[field].value);
      showError(field, message);
      if (message && !firstInvalid) firstInvalid = form.elements[field];
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Отправляем…';

    try {
      await sendLead({
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        question: form.elements.question.value,
        company: form.elements.company?.value ?? ''
      });

      // Заголовок и вводная строка уезжают вместе с формой: иначе
      // приглашение записаться висит над подтверждением записи.
      block?.classList.add('is-sent');
      form.hidden = true;
      success.hidden = false;
      success.querySelector('h3').focus?.();
    } catch (error) {
      const reason = error instanceof LeadError ? error.message : 'Что-то пошло не так.';
      failure.textContent = `Заявка не ушла: ${reason.toLowerCase()} Попробуйте ещё раз или позвоните: ${PHONE}.`;
      failure.hidden = false;
      console.error('[lead-form]', error);
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });

  resetButton?.addEventListener('click', () => {
    form.reset();
    Object.keys(rules).forEach((field) => showError(field, ''));
    success.hidden = true;
    block?.classList.remove('is-sent');
    form.hidden = false;
    form.elements.name.focus();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
