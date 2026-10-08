(() => {
  let client;
  const api = 'https://wqxbnwcdkobgeyhdmqup.supabase.co/functions/v1/revenue-access';
  const request = async (action, body) => {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Войдите через Google');
    const response = await fetch(action ? `${api}?action=${action}` : api, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось проверить доступ');
    return result;
  };
  const status = document.getElementById('accessStatus');
  const loadList = async () => {
    try {
      const data = await request('list');
      const list = document.getElementById('accessList');
      list.replaceChildren();
      data.emails.forEach((item) => {
        const row = document.createElement('div'); row.className = 'access-row';
        const label = document.createElement('span');
        label.textContent = `${item.email}${item.owner ? ' · владелец' : item.enabled ? ' · доступ открыт' : ' · отключен'}`;
        row.append(label);
        if (!item.owner) {
          const button = document.createElement('button'); button.type = 'button';
          button.textContent = item.enabled ? 'Отключить' : 'Разрешить';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await request('', { email: item.email, enabled: !item.enabled }); status.textContent = 'Доступ обновлен'; await loadList(); }
            catch (error) { status.textContent = error.message; button.disabled = false; }
          });
          row.append(button);
        }
        list.append(row);
      });
    } catch (error) { status.textContent = error.message; }
  };
  document.getElementById('accessForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('accessEmail');
    const button = event.target.querySelector('button'); button.disabled = true;
    try { await request('', { email: input.value.trim(), enabled: true }); input.value = ''; status.textContent = 'Просмотр разрешен. Пользователь может войти этой почтой через Google.'; await loadList(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  window.RevenueAccess = { check: (authClient) => { client = authClient; return request(''); }, loadList };
})();
