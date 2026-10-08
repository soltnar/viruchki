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
  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-section]');
    if (!button) return;
    const section = document.getElementById(button.dataset.section);
    if (button.dataset.section === 'seasonalitySection') section.querySelector('details').open = true;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
