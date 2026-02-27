const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        if (entry.target.dataset.counter) animateCounter(entry.target);
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
    const value = e.target.value.toLowerCase();
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
  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const payload = await res.json();
  form.querySelector('.form-message').textContent = payload.message;
  if (res.ok) form.reset();
}

document.querySelectorAll('form[data-api]').forEach((form) => {
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
if (adminLoadBtn) {
  adminLoadBtn.addEventListener('click', async () => {
    const token = document.querySelector('#admin-token')?.value || '';
    const status = document.querySelector('#admin-status');
    const table = document.querySelector('#requests-table');
    try {
      const res = await fetch('/api/admin/requests?limit=200', {
        headers: { 'x-admin-token': token }
      });
      const data = await res.json();
      if (!res.ok) {
        status.textContent = data.message || 'Ошибка доступа';
        return;
      }
      table.innerHTML = data.items
        .map((i) => `<tr><td>${i.id}</td><td>${i.created_at}</td><td>${i.name}</td><td>${i.phone}</td><td>${i.email || ''}</td><td>${i.item || ''}</td><td>${i.source || ''}</td></tr>`)
        .join('');
      status.textContent = `Загружено заявок: ${data.items.length}`;
    } catch (e) {
      status.textContent = 'Ошибка загрузки заявок';
    }
  });
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
