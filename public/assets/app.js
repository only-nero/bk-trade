const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        if (entry.target.dataset.counter) animateCounter(entry.target);
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll('.reveal, .counter-value').forEach((el) => io.observe(el));

function animateCounter(el) {
  if (el.dataset.done) return;
  const target = Number(el.dataset.counter || 0);
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 80));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(timer);
      el.dataset.done = '1';
    }
    el.textContent = current.toLocaleString('ru-RU');
  }, 18);
}

document.querySelectorAll('.accordion-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const content = btn.nextElementSibling;
    const open = content.style.maxHeight;
    document.querySelectorAll('.accordion-content').forEach((node) => (node.style.maxHeight = null));
    content.style.maxHeight = open ? null : `${content.scrollHeight}px`;
  });
});

const filterInput = document.querySelector('#catalog-filter');
if (filterInput) {
  filterInput.addEventListener('input', (e) => {
    const value = e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-category]').forEach((card) => {
      card.classList.toggle('hidden', !card.dataset.category.includes(value));
    });
  });
}

document.querySelectorAll('[data-request-item]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const itemInput = document.querySelector('#catalog-item');
    if (itemInput) {
      itemInput.value = btn.dataset.requestItem;
      document.querySelector('#catalog-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      itemInput.focus();
    }
  });
});

async function sendForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
  const message = form.querySelector('.form-message');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.defaultText = submitBtn.dataset.defaultText || submitBtn.textContent;
    submitBtn.textContent = 'Отправка...';
  }

  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const payload = await res.json().catch(() => ({}));
    if (message) message.textContent = payload.message || (res.ok ? 'Заявка отправлена.' : 'Ошибка отправки формы.');
    if (res.ok) form.reset();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.defaultText;
    }
  }
}

document.querySelectorAll('form[data-api]').forEach((form) => {
  form.querySelector('.form-message')?.setAttribute('aria-live', 'polite');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendForm(form).catch(() => {
      form.querySelector('.form-message').textContent = 'Не удалось отправить форму. Попробуйте позже.';
    });
  });
});

const modeKey = 'bk-mode';
const root = document.documentElement;
const storedMode = localStorage.getItem(modeKey);
if (storedMode) {
  root.dataset.mode = storedMode;
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.dataset.mode = 'dark';
}
syncLogos();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem(modeKey)) { root.dataset.mode = e.matches ? 'dark' : 'light'; syncLogos(); }
});

document.querySelectorAll('[data-toggle-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const nextMode = root.dataset.mode === 'dark' ? 'light' : 'dark';
    root.dataset.mode = nextMode;
    localStorage.setItem(modeKey, nextMode);
    syncLogos();
  });
});



function syncLogos() {
  const dark = document.documentElement.dataset.mode === 'dark';
  document.querySelectorAll('img[src*="logo-bk-trade"]').forEach((img) => {
    img.src = dark ? '/assets/logo-bk-trade-dark.svg' : '/assets/logo-bk-trade.svg';
  });
}

const cookieBanner = document.querySelector('#cookie-banner');
if (cookieBanner && localStorage.getItem('cookies-ok') === '1') cookieBanner.remove();
document.querySelector('#cookie-ok')?.addEventListener('click', () => {
  localStorage.setItem('cookies-ok', '1');
  cookieBanner?.remove();
});

const adminLoadBtn = document.querySelector('#load-requests');
const adminLoginForm = document.querySelector('#admin-login-form');
if (adminLoadBtn || adminLoginForm) {
  const status = document.querySelector('#admin-status');
  const table = document.querySelector('#requests-table');
  const adminPanel = document.querySelector('#admin-panel');
  const authCard = document.querySelector('#admin-auth-card');
  const sessionUser = document.querySelector('#admin-session-user');

  const renderRows = (items) => {
    table.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      [item.id, item.created_at, item.name, item.phone, item.email || '', item.item || '', item.source || ''].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = String(value ?? '');
        tr.appendChild(td);
      });

      const statusTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `status-badge status-${item.status || 'new'}`;
      badge.textContent = item.status === 'done' ? 'Закрыта' : item.status === 'in_progress' ? 'В работе' : 'Новая';
      statusTd.appendChild(badge);
      tr.appendChild(statusTd);

      const actionsTd = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost';
      editBtn.textContent = 'Статус';
      editBtn.addEventListener('click', async () => {
        const nextStatus = prompt('Статус заявки: new, in_progress, done', item.status || 'new');
        if (!nextStatus) return;
        const note = prompt('Комментарий менеджера (необязательно):', item.manager_note || '') || '';
        try {
          const res = await fetch(`/api/admin/requests/${item.id}/status`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus.trim(), manager_note: note })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Не удалось обновить статус');
          await loadAdminRequests();
        } catch (e) {
          if (status) status.textContent = e.message || 'Ошибка обновления статуса';
        }
      });
      actionsTd.appendChild(editBtn);
      tr.appendChild(actionsTd);

      table.appendChild(tr);
    });
  };

  const setAuthorized = (isAuthorized, username = '') => {
    authCard?.classList.toggle('hidden', isAuthorized);
    adminPanel?.classList.toggle('hidden', !isAuthorized);
    if (sessionUser && username) sessionUser.textContent = username;
  };

  const loadAdminRequests = async () => {
    const res = await fetch('/api/admin/requests?limit=200', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка доступа');
    renderRows(data.items || []);
    if (status) status.textContent = `Загружено заявок: ${data.items.length}`;
  };

  const checkSession = async () => {
    try {
      const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
      if (!res.ok) {
        setAuthorized(false);
        return;
      }
      const data = await res.json();
      setAuthorized(true, data.username || 'менеджер');
      await loadAdminRequests();
    } catch {
      setAuthorized(false);
    }
  };

  adminLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = adminLoginForm.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(adminLoginForm));
    if (submit) {
      submit.disabled = true;
      submit.dataset.defaultText = submit.dataset.defaultText || submit.textContent;
      submit.textContent = 'Вход...';
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        if (status) status.textContent = data.message || 'Ошибка входа';
        return;
      }
      if (status) status.textContent = 'Вход выполнен успешно.';
      setAuthorized(true, data.username || payload.username || 'менеджер');
      await loadAdminRequests();
      adminLoginForm.reset();
    } catch {
      if (status) status.textContent = 'Ошибка соединения. Попробуйте позже.';
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = submit.dataset.defaultText;
      }
    }
  });

  adminLoadBtn?.addEventListener('click', () => {
    loadAdminRequests().catch((e) => {
      if (status) status.textContent = e.message || 'Ошибка загрузки заявок';
    });
  });

  document.querySelector('#admin-logout')?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      setAuthorized(false);
      if (status) status.textContent = 'Вы вышли из кабинета.';
      table.innerHTML = '';
    }
  });

  checkSession();
}


document.querySelectorAll('.dropdown').forEach((drop) => {
  const trigger = drop.querySelector('.dropdown-trigger');
  if (!trigger) return;
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = drop.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });
});

document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown.open').forEach((drop) => {
    if (!drop.contains(e.target)) {
      drop.classList.remove('open');
      drop.querySelector('.dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
});

const progress = document.querySelector('#scroll-progress');
if (progress) {
  let ticking = false;
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? (window.scrollY / max) * 100 : 0;
    progress.style.transform = `scaleX(${Math.min(100, Math.max(0, ratio)) / 100})`;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateProgress);
      ticking = true;
    }
  }, { passive: true });
  updateProgress();
}

const rotator = document.querySelector('[data-rotator]');
if (rotator) {
  const items = (rotator.dataset.items || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  let index = 0;
  if (items.length) {
    rotator.textContent = items[0];
    setInterval(() => {
      index = (index + 1) % items.length;
      rotator.classList.remove('visible');
      requestAnimationFrame(() => {
        rotator.textContent = items[index];
        rotator.classList.add('visible');
      });
    }, 3000);
  }
}

const heroGlow = document.querySelector('[data-hero-glow]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (heroGlow && !prefersReducedMotion) {
  let frame = null;
  window.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      heroGlow.style.setProperty('--pointer-x', `${x}%`);
      heroGlow.style.setProperty('--pointer-y', `${y}%`);
      frame = null;
    });
  }, { passive: true });
}


document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.dropdown.open').forEach((drop) => {
    drop.classList.remove('open');
    drop.querySelector('.dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  });
  const chat = document.querySelector('#manager-chat-widget.open');
  if (chat) {
    chat.classList.remove('open');
    chat.querySelector('.manager-chat-toggle')?.setAttribute('aria-expanded', 'false');
    chat.querySelector('#manager-chat-panel')?.setAttribute('aria-hidden', 'true');
  }
});


function initManagerChat() {
  if (document.body.dataset.managerChatReady === '1') return;
  if (document.querySelector('#manager-chat-widget') || location.pathname.includes('/internal/ops-panel')) return;

  document.body.dataset.managerChatReady = '1';
  document.body.insertAdjacentHTML('beforeend', `
    <div id="manager-chat-widget" class="manager-chat" aria-live="polite">
      <button type="button" class="manager-chat-toggle btn btn-primary" aria-expanded="false" aria-controls="manager-chat-panel">
        <span class="manager-chat-dot" aria-hidden="true"></span>
        Чат с менеджером
      </button>
      <section id="manager-chat-panel" class="manager-chat-panel card" aria-hidden="true">
        <header class="manager-chat-head">
          <strong>Менеджер БК-Трейд онлайн</strong>
          <button type="button" class="manager-chat-close" aria-label="Закрыть чат">✕</button>
        </header>
        <p class="manager-chat-hint">Обычно отвечаем в течение 10–15 минут. Оставьте контакты — перезвоним быстрее.</p>
        <form class="manager-chat-form" novalidate>
          <input type="hidden" name="source" value="Виджет: чат с менеджером" />
          <input type="hidden" name="website" value="" />
          <input name="name" placeholder="Ваше имя" required />
          <input name="phone" placeholder="Телефон" required />
          <textarea name="message" rows="3" placeholder="Что требуется поставить?" required></textarea>
          <button class="btn btn-primary" type="submit">Отправить менеджеру</button>
          <p class="form-message"></p>
        </form>
      </section>
    </div>
  `);

  const wrap = document.querySelector('#manager-chat-widget');
  const toggle = wrap?.querySelector('.manager-chat-toggle');
  const panel = wrap?.querySelector('#manager-chat-panel');
  const close = wrap?.querySelector('.manager-chat-close');
  const form = wrap?.querySelector('.manager-chat-form');

  const setOpen = (open) => {
    wrap?.classList.toggle('open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    panel?.setAttribute('aria-hidden', String(!open));
  };

  toggle?.addEventListener('click', () => setOpen(!wrap.classList.contains('open')));
  close?.addEventListener('click', () => setOpen(false));

  form?.querySelector('.form-message')?.setAttribute('aria-live', 'polite');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    sendForm(form).then(() => {
      if (form.querySelector('.form-message')?.textContent) setOpen(true);
    }).catch(() => {
      form.querySelector('.form-message').textContent = 'Сбой отправки. Напишите нам по телефону +7 (3452) 66-12-30.';
    });
  });
}

initManagerChat();
