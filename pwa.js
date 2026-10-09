(() => {
  const buildVersion = '2026-10-09.2';
  let versionCheckRunning = false;
  const checkVersion = async () => {
    if (versionCheckRunning || !navigator.onLine || location.search.includes('code=') || location.hash.includes('access_token')) return;
    versionCheckRunning = true;
    try {
      const response = await fetch(`./app-version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json();
      if (typeof version === 'string' && version !== buildVersion) {
        const url = new URL(location.href);
        if (url.searchParams.get('build') !== version) {
          url.searchParams.set('build', version);
          location.replace(url.href);
        }
      }
    } catch { /* Offline mode does not interrupt the current screen. */ }
    finally { versionCheckRunning = false; }
  };
  window.addEventListener('pageshow', checkVersion);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
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
  const views = { compareSection: 'compare', revenueSection: 'revenue', seasonalitySection: 'analytics', mobileSettings: 'settings' };
  const showView = (view) => {
    document.body.dataset.mobileView = view;
    const titles = { revenue: 'Выручка', compare: 'Сравнение периодов', analytics: 'Аналитика', settings: 'Настройки' };
    document.querySelector('.hero h1').textContent = titles[view];
    nav.querySelectorAll('button').forEach((button) => {
      const active = views[button.dataset.section] === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  };
  showView('revenue');
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
  const filters = document.querySelector('#app > .panel.filters');
  const relocations = [];
  const relocate = (element, destination) => {
    if (!element || !destination) return;
    const marker = document.createComment('desktop-position');
    element.before(marker);
    relocations.push({ element, destination, marker });
  };
  [...filters.children].filter((element) => element.classList.contains('filter-group') &&
    !element.classList.contains('data-range-group') && !element.querySelector('#restaurantFilter'))
    .forEach((element) => relocate(element, document.getElementById('mobileSettingsFilters')));
  relocate(document.querySelector('#revenueSection .table-controls'), document.getElementById('mobileSettingsDisplay'));
  relocate(document.getElementById('exportExcel'), document.getElementById('settingsExportButtons'));
  relocate(document.getElementById('exportPdf'), document.getElementById('settingsExportButtons'));
  relocate(document.getElementById('dateTotalsHeading'), document.getElementById('mobileDailyDetail'));
  relocate(document.getElementById('dateTotalsWrap'), document.getElementById('mobileDailyDetail'));
  relocate(document.getElementById('accessPanel'), document.getElementById('mobileSettings'));
  const syncLayout = (isMobile = true) => {
    relocations.forEach(({ element, destination, marker }) => {
      if (isMobile) destination.append(element);
      else marker.after(element);
    });
  };
  mobile.addEventListener('change', () => syncLayout());
  window.addEventListener('beforeprint', () => syncLayout(false));
  window.addEventListener('afterprint', () => syncLayout());
  syncLayout();
  const status = document.getElementById('apiStatus');
  const syncRefresh = () => {
    document.getElementById('mobileRevenueStatus').textContent = status.textContent.trim();
  };
  new MutationObserver(syncRefresh).observe(status, { childList: true, subtree: true, characterData: true });
  syncRefresh();
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
