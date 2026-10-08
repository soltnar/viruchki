const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER = "soltnar@gmail.com";
const headers = { "Access-Control-Allow-Origin": "https://soltnar.github.io", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const dbHeaders = { apikey: KEY, authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Войдите через Google" }, 401);
    const auth = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { authorization, apikey: KEY } });
    if (!auth.ok) return json({ error: "Сессия истекла" }, 401);
    const user = await auth.json();
    const email = String(user.email || "").trim().toLowerCase();
    const admin = email === OWNER;
    const table = `${URL_BASE}/rest/v1/revenue_allowed_emails`;
    if (!admin) {
      const check = await fetch(`${table}?email=eq.${encodeURIComponent(email)}&enabled=eq.true&select=email`, { headers: dbHeaders });
      if (!check.ok) return json({ error: "Не удалось проверить доступ" }, 503);
      if (!(await check.json()).length) return json({ error: "Эта почта не имеет доступа" }, 403);
    }
    if (req.method === "GET") {
      if (admin && new URL(req.url).searchParams.get("action") === "list") {
        const response = await fetch(`${table}?select=email,enabled&order=email.asc`, { headers: dbHeaders });
        if (!response.ok) throw new Error("Не удалось получить список доступа");
        return json({ admin, emails: [{ email: OWNER, enabled: true, owner: true }, ...(await response.json()).filter((row: {email:string}) => row.email !== OWNER)] });
      }
      return json({ allowed: true, admin, email });
    }
    if (req.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);
    if (!admin) return json({ error: "Только владелец может менять доступ" }, 403);
    const body = await req.json();
    const target = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 254 || typeof body.enabled !== "boolean") return json({ error: "Проверьте почту" }, 400);
    if (target === OWNER) return json({ error: "Доступ владельца изменить нельзя" }, 400);
    const response = await fetch(`${table}?on_conflict=email`, { method: "POST", headers: { ...dbHeaders, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ email: target, enabled: body.enabled, updated_at: new Date().toISOString() }) });
    if (!response.ok) throw new Error("Не удалось сохранить доступ");
    return json({ ok: true });
  } catch { return json({ error: "Ошибка управления доступом" }, 500); }
});
