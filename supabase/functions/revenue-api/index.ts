const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SABY_APP_CLIENT_ID = Deno.env.get("SABY_APP_CLIENT_ID")!;
const SABY_APP_SECRET = Deno.env.get("SABY_APP_SECRET")!;
const SABY_SERVICE_KEY = Deno.env.get("SABY_SERVICE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ALLOWED_EMAIL = "soltnar@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": "https://soltnar.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function datesBetween(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Некорректный период");
  }
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > 366) throw new Error("Период просмотра не должен превышать 366 дней");
  }
  return dates;
}

async function authorize(req: Request) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) return { cron: true };
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization, apikey: SERVICE_KEY },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return String(user.email || "").toLowerCase() === ALLOWED_EMAIL ? { cron: false, user } : null;
}

async function databaseRows(from: string, to: string) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/revenue_entries?select=sale_date,warehouse_id,restaurant,revenue,quantity,returns&sale_date=gte.${from}&sale_date=lte.${to}&order=sale_date.asc&offset=${offset}&limit=1000`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!response.ok) throw new Error(`Ошибка чтения базы: ${response.status}`);
    const page = await response.json();
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result.map((row: Record<string, unknown>) => ({
    date: row.sale_date,
    warehouseId: row.warehouse_id,
    restaurant: row.restaurant,
    revenue: Number(row.revenue),
    quantity: Number(row.quantity),
    returns: Number(row.returns),
  }));
}

async function sabyToken() {
  const response = await fetch("https://online.sbis.ru/oauth/service/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_client_id: SABY_APP_CLIENT_ID,
      app_secret: SABY_APP_SECRET,
      secret_key: SABY_SERVICE_KEY,
    }),
  });
  const auth = await response.json();
  if (!response.ok || !auth.token) throw new Error("Saby не выдал токен");
  return auth.token;
}

function recordObject(record: { s?: Array<{ n: string }>; d?: unknown[] }) {
  return Object.fromEntries((record?.s || []).map((field, index) => [field.n, record.d?.[index]]));
}

async function sabyDay(date: string, token: string) {
  const fields = [
    ["Строка", "PrefetchLevels", "1"], ["Строка", "PrefetchMethod", "SalesAnalytics.GetDataWithoutCaching"],
    ["Число целое", "PrefetchPages", 33], ["Строка", "PrefetchSessionLiveTime", "P30DT0H0M0S"],
    ["Строка", "Product", null], ["Строка", "ReportMode", "Period"], ["Строка", "hasCharacteristics", null],
    ["Строка", "modalOperationToken", crypto.randomUUID()], ["Логическое", "pathEnable", true],
    ["Строка", "resultMethod", "Warehouse_Stats/VDWarehouseReports/WarehouseReport/Reports/Sales/SalesReportUnion:openNewWindow"],
    [{ n: "Массив", t: "Строка" }, "Детализация", ["Склад", "Дата"]], ["Строка", "ДетализацияПериод", "day"],
    ["Логическое", "ИерархияНоменклатура", true], ["Логическое", "ИерархияОрганизацияФилиал", false],
    ["Логическое", "ИерархияСотрудник", false], ["Дата", "ПериодКонец", date],
    ["Строка", "ПериодКонецАнализ", null], ["Дата", "ПериодНачало", date],
    ["Строка", "ПериодНачалоАнализ", null], ["Строка", "Раздел", null], ["Строка", "РежимФильтраПрайс", null],
    [{ n: "Массив", t: "Строка" }, "ФильтрНоменклатура", []],
    [{ n: "Массив", t: "Дата" }, "ФильтрПериод", [date, date, null, null]],
    [{ n: "Массив", t: "Строка" }, "ФильтрСклад", []], ["Строка", "ФильтрЦены", null],
    ["Строка", "ФильтрЦеныДата", null],
  ];
  const filter = {
    d: fields.map((item) => item[2]),
    s: fields.map((item) => ({ t: item[0], n: item[1] })),
    _type: "record", f: 0,
  };
  const request = {
    jsonrpc: "2.0", protocol: 7, method: "SalesAnalytics.GetData", id: 1,
    params: {
      "Фильтр": filter,
      "Сортировка": { d: [[false, "СуммаЦен", true]], s: [{ t: "Логическое", n: "l" }, { t: "Строка", n: "n" }, { t: "Логическое", n: "o" }], _type: "recordset", f: 0 },
      "Навигация": { d: [true, 200, 0], s: [{ t: "Логическое", n: "ЕстьЕще" }, { t: "Число целое", n: "РазмерСтраницы" }, { t: "Число целое", n: "Страница" }], _type: "record", f: 0 },
      "ДопПоля": [],
    },
  };
  const call = async () => {
    const response = await fetch("https://online.saby.ru/service/", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-SBISAccessToken": token, "X-CalledMethod": "SalesAnalytics.GetData", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(request),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error("Saby не вернул отчет");
    return data;
  };
  let data = await call();
  let session = recordObject(data.result.r).PrefetchSessionId;
  if (session) {
    const index = 3;
    filter.s.splice(index, 0, { t: "Строка", n: "PrefetchSessionId" });
    filter.d.splice(index, 0, session);
  }
  for (let attempt = 0; attempt < 12 && data.result.d.length === 0 && session; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    data = await call();
    session = recordObject(data.result.r).PrefetchSessionId || session;
    filter.d[filter.s.findIndex((field) => field.n === "PrefetchSessionId")] = session;
  }
  const names = data.result.s.map((field: { n: string }) => field.n);
  return data.result.d.map((values: unknown[]) => {
    const row = Object.fromEntries(names.map((name: string, index: number) => [name, values[index]]));
    return {
      sale_date: date,
      warehouse_id: String(row.wh ?? ""),
      restaurant: String(row["Склад.Название"] ?? ""),
      revenue: Number(row.СуммаЦенСВозвратами ?? row.СуммаЦен),
      quantity: Number(row.Количество) || 0,
      returns: Number(row.ВозвратСуммаЦен) || 0,
      updated_at: new Date().toISOString(),
    };
  }).filter((row: { warehouse_id: string; restaurant: string; revenue: number }) =>
    row.warehouse_id && row.restaurant && Number.isFinite(row.revenue)
  );
}

async function refresh(from: string, to: string) {
  const dates = datesBetween(from, to);
  if (dates.length > 31) throw new Error("За один запрос можно обновить не более 31 дня");
  const token = await sabyToken();
  const rows = [];
  for (let i = 0; i < dates.length; i += 4) {
    rows.push(...(await Promise.all(dates.slice(i, i + 4).map((date) => sabyDay(date, token)))).flat());
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/revenue_entries?on_conflict=sale_date,warehouse_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Ошибка сохранения: ${response.status}`);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const identity = await authorize(req);
    if (!identity) return json({ error: "Доступ запрещен" }, 403);
    const url = new URL(req.url);
    if (req.method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      datesBetween(from, to);
      const rows = await databaseRows(from, to);
      return json({ from, to, generatedAt: new Date().toISOString(), rows });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const count = await refresh(String(body.from || ""), String(body.to || ""));
      return json({ ok: true, updatedRows: count, rows: await databaseRows(body.from, body.to) });
    }
    return json({ error: "Метод не поддерживается" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ошибка сервера" }, 400);
  }
});
