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

    const payload = await res.json();
    if (message) message.textContent = payload.message;
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
      table.innerHTML = '';
      data.items.forEach((item) => {
        const tr = document.createElement('tr');
        [item.id, item.created_at, item.name, item.phone, item.email || '', item.item || '', item.source || ''].forEach((value) => {
          const td = document.createElement('td');
          td.textContent = String(value ?? '');
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
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
});
