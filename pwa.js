(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  document.body.classList.toggle('standalone-app', Boolean(standalone));
  document.querySelectorAll('[data-install-help]').forEach((button) => {
    button.hidden = Boolean(standalone);
    button.addEventListener('click', () => document.getElementById('installHelp').showModal());
  });
  const nav = document.querySelector('.mobile-nav');
  const app = document.getElementById('app');
  const syncNav = () => { nav.hidden = app.classList.contains('is-hidden'); };
  new MutationObserver(syncNav).observe(app, { attributes: true, attributeFilter: ['class'] });
  syncNav();
  const mobile = window.matchMedia('(max-width: 700px)');
  const views = { app: 'period', compareSection: 'compare', revenueSection: 'revenue', seasonalitySection: 'analytics' };
  const showView = (view) => {
    document.body.dataset.mobileView = view;
    nav.querySelectorAll('button').forEach((button) => {
      const active = views[button.dataset.section] === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  };
  showView('period');
  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-section]');
    if (!button) return;
    showView(views[button.dataset.section]);
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
  const disclosures = [];
  const fold = (element, title) => {
    if (!element) return;
    const details = document.createElement('details');
    details.className = 'mobile-disclosure';
    const summary = document.createElement('summary');
    summary.textContent = title;
    element.before(details);
    details.append(summary, element);
    disclosures.push(details);
  };
  fold(document.querySelector('#revenueSection .table-controls'), 'Настройки списка и экспорт');
  fold(document.querySelector('#chartSection .chart-controls'), 'Настройки графика');
  ['weatherImpactSection', 'seasonalitySection', 'forecastSection'].forEach((id) => {
    const section = document.getElementById(id);
    const hints = [...section.querySelectorAll('.collapsible-content > .hint, :scope > .hint')]
      .filter((element) => !element.id);
    if (!hints.length) return;
    const content = document.createElement('div');
    hints[0].before(content);
    hints.forEach((hint) => content.append(hint));
    fold(content, 'Как рассчитывается');
  });
  const syncDisclosures = () => disclosures.forEach((details) => { details.open = !mobile.matches; });
  mobile.addEventListener('change', syncDisclosures);
  syncDisclosures();
  const syncNetwork = () => { document.getElementById('networkStatus').hidden = navigator.onLine; };
  window.addEventListener('online', syncNetwork);
  window.addEventListener('offline', syncNetwork);
  syncNetwork();
  ['restaurantFilter', 'warehouseType'].forEach((id) => {
    const select = document.getElementById(id);
    const picker = document.createElement('details');
    picker.className = 'mobile-picker';
    const summary = document.createElement('summary');
    const choices = document.createElement('div');
    picker.append(summary, choices);
    select.after(picker);
    const render = () => {
      const selected = [...select.selectedOptions];
      summary.textContent = selected.length ? `${id === 'restaurantFilter' ? 'Рестораны' : 'Склады'}: ${selected.length} выбрано` : `Все ${id === 'restaurantFilter' ? 'рестораны' : 'склады'}`;
      choices.replaceChildren();
      const all = document.createElement('button');
      all.type = 'button'; all.textContent = 'Выбрать все';
      all.addEventListener('click', () => {
        [...select.options].forEach((option) => { option.selected = false; });
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      choices.append(all);
      [...select.options].forEach((option) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = option.selected;
        checkbox.addEventListener('change', () => {
          option.selected = checkbox.checked;
          if (id === 'warehouseType' && option.value !== 'all') {
            [...select.options].filter((item) => item.value === 'all').forEach((item) => { item.selected = false; });
          } else if (id === 'warehouseType' && option.value === 'all' && checkbox.checked) {
            [...select.options].filter((item) => item !== option).forEach((item) => { item.selected = false; });
          }
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        label.append(checkbox, document.createTextNode(option.textContent));
        choices.append(label);
      });
    };
    new MutationObserver(render).observe(select, { childList: true });
    select.addEventListener('change', render);
    render();
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('PWA registration:', error.message));
  }
})();
