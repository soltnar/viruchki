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
  const email = String(user.email || "").trim().toLowerCase();
  if (email === ALLOWED_EMAIL) return { cron: false, user };
  if (req.method !== "GET") return null;
  const access = await fetch(
    `${SUPABASE_URL}/rest/v1/revenue_allowed_emails?email=eq.${encodeURIComponent(email)}&enabled=eq.true&select=email`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!access.ok || !(await access.json()).length) return null;
  return { cron: false, user };
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

// These two accounts predate the employee registry and have their
// profiles.full_name stored as "Имя Фамилия" with no patronymic (e.g.
// "Дмитрий Дьяков") — the opposite order/completeness of every registry
// employee (who are entered "Фамилия Имя Отчество", e.g. "Жалмухамбетов
// Нурлан Ермекович"). Rather than guess word order, these two keep an
// explicit override to the exact identity Saby already has documents under;
// everyone else is parsed generically in buildPerson below.
const ADVANCE_PEOPLE_OVERRIDES: Record<string, { Идентификатор: string; Фамилия: string; Имя: string; Отчество: string }> = {
  "Дмитрий Дьяков": { Идентификатор: "Дьяков Дмитрий Александрович", Фамилия: "Дьяков", Имя: "Дмитрий", Отчество: "Александрович" },
  "Денис Черных": { Идентификатор: "Черных Денис Вячеславович", Фамилия: "Черных", Имя: "Денис", Отчество: "Вячеславович" },
};
// Splits an employee's full_name into the parts needed to look them up in
// Saby's own staff directory: Фамилия alone is the search string
// (findStaffByName below), and the full "Фамилия Имя Отчество" string
// (Идентификатор) is what a Staff.SelectionList result's FullName is
// compared against for an exact match. Registry employees are entered in
// that order already; for the two who predate the registry (see
// ADVANCE_PEOPLE_OVERRIDES) this is hardcoded to their real Saby identity.
function buildPerson(fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const override = ADVANCE_PEOPLE_OVERRIDES[trimmed];
  if (override) return override;
  const parts = trimmed.split(" ").filter(Boolean);
  if (!parts.length) throw new Error("Не указано имя сотрудника");
  const [Фамилия, Имя = "", Отчество = ""] = parts;
  return { Идентификатор: parts.join(" "), Фамилия, Имя, Отчество };
}
const MANAGEMENT_ORGANIZATION_ID = 5308;

// Saby internal Face/@Лицо id for each real legal entity, keyed by ИНН —
// this is what a cash (non-card) advance report files under.
const ORG_INTERNAL_IDS: Record<string, number> = {
  "525624848608": 145, // ИП Ильин
  "5260450547": 253, // ООО Венусто
  "5249083300": 112, // ООО Деманчи
  "5261136245": 95904, // ООО Парк
  "5258151420": 2121, // ООО Приспех
  "5260263040": 4610, // ООО Чайка
};

// Each Saby legal entity above is itself a *parent* of branch-level "our
// organization" records — one per physical venue, each its own internal id
// (confirmed live via OurOrg.listWithBranches, e.g. Чайка's head office is
// id 4610 but its "Белинского, 61" branch is the separate id 5419). A
// business-card expense for an employee tied to a specific venue should
// file under THAT branch, not the flat head entity — this is the numeric
// id that ends up in a report's Лицо3 and a line's ДокументНашаОрганизация.
// Keyed by "<ИНН>:<venue name in our own venues table>"; only venues
// confirmed against a live Saby branch listing are included — an unmapped
// venue just falls back to the flat head-org id.
const BRANCH_ORG_IDS: Record<string, number> = {
  // ИП Ильин (525624848608)
  "525624848608:Фабрика кухни · Белинского 61": 1345,
  "525624848608:Доставка · Белинского 61": 198528,
  "525624848608:Коминтерна 166": 229810,
  "525624848608:Геологов": 236424,
  "525624848608:Моторный 2к1": 237256,
  "525624848608:Доставка · Верхне-Печерская 14Б": 305942,
  "525624848608:Доставка · Циолковского 19А": 305975,
  "525624848608:Доставка · Ленина 36": 367497,
  "525624848608:Доставка · Волжская наб. 13": 421640,
  // ООО Приспех (5258151420)
  "5258151420:Б. Покровская 59/2": 27861,
  "5258151420:Коминтерна 115": 27871,
  "5258151420:Верхне-Печерская 14Б": 34249,
  "5258151420:Веденяпина 1А": 4702,
  "5258151420:Октября 2": 144388,
  "5258151420:Ударник": 5031,
  // ООО Деманчи (5249083300)
  "5249083300:Каспарус": 261,
  "5249083300:Ленина 36": 267,
  "5249083300:Б. Покровская 63": 285,
  // ООО Венусто (5260450547)
  "5260450547:Рибс": 275,
  "5260450547:Винедо": 279,
  "5260450547:Ленина 36": 1048442,
  // ООО Парк (5261136245)
  "5261136245:Швейцария": 141552,
  "5261136245:Б. Покровская 63": 1209814,
  // ООО Чайка (5260263040)
  "5260263040:Белинского 61": 5419,
  "5260263040:Волжская наб. 13": 15303,
  "5260263040:Ресторан XIX": 47317,
};

// Saby "статья затрат" (ExpenseItem) numeric ids, resolved once from Saby's own
// catalog (ExpenseItem.GetItemIdsList). The external document-creation API
// cannot reliably resolve a category from its Название alone — for most names
// it silently leaves the line uncategorized, and for "Коммунальные платежи"
// (which exists twice in Saby's catalog under different ids) it hard-fails
// with "Нельзя определить конкретную статью затрат по переданному названию".
// So category assignment is done as a follow-up internal-API correction pass
// instead (see applyLineAnalytics), by numeric id.
const CATEGORY_IDS: Record<string, number> = {
  "Аренда помещений": 12,
  "Аренда торговых помещений": 120850,
  "Банковское обслуживание, комиссии": 69,
  "Бензин, ГСМ": 45,
  "Благотворительность, безвозмездная передача": 74,
  "Госпошлины, сборы, нотариальные услуги": 70,
  "Коммунальные платежи": 120851,
  "Компьютеры, оборудование, обслуживание": 19,
  "Материалы, сырье в производство": 27,
  "Мероприятия, праздники": 89,
  "Мобильная связь": 41,
  "Охрана": 13,
  "Питание": 81,
  "Под отчет": 120650,
  "Проценты по займам, кредитам": 72,
  "Прочие командировочные расходы": 32,
  "Прочие расходы": 57,
  "Расчеты с персоналом": 120653,
  "Реклама, продвижение": 53,
  "Руководитель": 120687,
  "Содержание и текущий ремонт": 14,
  "Содержание, ремонт, страхование транспорта": 46,
  "Спецодежда, инвентарь": 29,
  "Стройка новых объектов": 120864,
  "Хозяйственные расходы": 16,
  "Штрафы, пени, неустойки": 73,
};

// Saby AccountObject (venue/point-of-sale) numeric ids. The app's venue names
// don't match Saby's registered object names verbatim (e.g. app "Ресторан
// XIX" vs Saby "Ресторан 19, Ошарская 8а"), so this is a hand-verified name
// map rather than a live search. Only venues with an unambiguous single Saby
// match are listed; venues with multiple plausible Saby candidates or no
// match at all are intentionally left unmapped (see the deploy notes) so the
// sync leaves their analytics blank rather than guessing wrong on real
// accounting data.
const VENUE_IDS: Record<string, number> = {
  "Б. Покровская 59/2": 2099,
  "Белинского 61": 184725,
  "Бургер БИК · Гагарина 35": 15034,
  "Веденяпина 1А": 61364,
  "Верхне-Печерская 14Б": 34344,
  "Доставка · Верхне-Печерская 14Б": 34344,
  "Винедо": 4674,
  "Волжская наб. 13": 25084,
  "Доставка · Волжская наб. 13": 25084,
  "Геологов": 608093,
  "Доставка · Белинского 61": 1902,
  "Каспарус": 2097,
  "Доставка · Циолковского 19А": 2097,
  "Фабрика кухни · Белинского 61": 54636,
  "Коминтерна 115": 33911,
  "Коминтерна 166": 55797,
  "НТО Приспех · Гагарина 35": 606107,
  "Самурай · Гагарина 35 · Парк": 61335,
  "Швейцария": 61335,
  "Октября 2": 144993,
  "Ресторан XIX": 49530,
  "Рибс": 1392,
  "Ударник": 191705,
  "Б. Покровская 63": 61365,
  "Ленина 36": 27946,
  "Доставка · Ленина 36": 27946,
  "Моторный 2к1": 1978,
};

// The account every advance-report expense line posts to. Matches what the
// Saby UI itself writes for a manually-set line (confirmed from a HAR capture
// of the user doing this by hand) and what this project's existing manual
// fix tooling (saby_edo.mjs) already hardcodes.
const COST_ACCOUNT_ID = 57;
const COST_ACCOUNT_NUMBER = "26-01";
const COST_ACCOUNT_NAME = "Общехозяйственные коммерческие расходы";

async function sabyInternalCall(token: string, method: string, params: unknown) {
  const response = await fetch("https://online.sbis.ru/service/?srv=1", {
    method: "POST",
    headers: { "Content-Type": "application/json-rpc;charset=utf-8", "X-SBISAccessToken": token },
    body: JSON.stringify({ jsonrpc: "2.0", protocol: 7, method, params, id: 1 }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error("Saby internal: " + JSON.stringify(data.error || { status: response.status }));
  return data.result;
}
function sabyRecordFields(record: Record<string, any>) {
  return Object.fromEntries((record.s || []).map((field: Record<string, any>, index: number) => [field.n, record.d[index]]));
}

// Looks up an employee in Saby's own staff directory by free-text search
// (the same call Saby's own UI makes, e.g. searching "терга" to find
// "Терганов Кирилл Вадимович"; filter shape confirmed from a HAR capture of
// that search) and returns the matching real employee's PrivatePerson id —
// the numeric identity every report/line below is actually assigned to via
// setReportPerson/createLine, sidestepping free-text employee resolution
// entirely (confirmed live: that's exactly what "Не удалось определить
// работающего сотрудника по идентификатору" was — a resolver failure in the
// old free-text path, not anything about the employee's own record).
async function findStaffByName(token: string, searchString: string) {
  const today = new Date().toISOString().slice(0, 10);
  const filter = {
    d: [null, null, null, null, null, ["WorkState", "FiredDate", "HiredDate", "Contact", "CanEdit", "EmplData"], [], null, [], false, "Id", null, null, false, null, null, -2, null, null, [], null, null, 50, [], ["Авансовые отчеты"], searchString, ["FIO", "DepName", "PHONE", "TAB"], null, "full", "С разворотом", {
      d: ["Active", today, today, []],
      s: [{ t: "Строка", n: "Status" }, { t: "Дата", n: "From" }, { t: "Дата", n: "To" }, { t: { n: "Массив", t: "Строка" }, n: "MultiContractType" }],
      _type: "record", f: 1,
    }],
    s: [
      { t: "Строка", n: "Access" }, { t: "Строка", n: "AccrualTypes" }, { t: "Строка", n: "ActivePeriod" }, { t: "Строка", n: "Age" }, { t: "Строка", n: "Birthday" },
      { t: { n: "Массив", t: "Строка" }, n: "CalcFields" }, { t: { n: "Массив", t: "Строка" }, n: "City" }, { t: "Строка", n: "DistantEmployees" },
      { t: { n: "Массив", t: "Строка" }, n: "EmploymentType" }, { t: "Логическое", n: "EmptyActual" }, { t: "Строка", n: "EntityType" }, { t: "Строка", n: "Gender" },
      { t: "Строка", n: "Maternity" }, { t: "Логическое", n: "MngtHistory" }, { t: "Строка", n: "Nationality" }, { t: "Строка", n: "OnlyChiefs" },
      { t: "Число целое", n: "Organization" }, { t: "Строка", n: "OurCompanyOnly" }, { t: "Строка", n: "Parent" }, { t: { n: "Массив", t: "Строка" }, n: "Position" },
      { t: "Строка", n: "Probation" }, { t: "Строка", n: "RecordsMark" }, { t: "Число целое", n: "RowsLimit" }, { t: { n: "Массив", t: "Строка" }, n: "Schedule" },
      { t: { n: "Массив", t: "Строка" }, n: "ScopesAreas" }, { t: "Строка", n: "SearchString" }, { t: { n: "Массив", t: "Строка" }, n: "Wanted" },
      { t: "Строка", n: "WithWorkgroup" }, { t: "Строка", n: "usePages" }, { t: "Строка", n: "Разворот" }, { t: "Запись", n: "Working" },
    ],
    _type: "record", f: 0,
  };
  const result = await sabyInternalCall(token, "Staff.SelectionList", {
    Фильтр: filter,
    Сортировка: null,
    Навигация: { d: [true, 50, 0], s: [{ t: "Логическое", n: "ЕстьЕще" }, { t: "Число целое", n: "РазмерСтраницы" }, { t: "Число целое", n: "Страница" }], _type: "record", f: 0 },
    ДопПоля: [],
  });
  const names = result.s.map((field: Record<string, any>) => field.n);
  return result.d.filter(Array.isArray)
    .map((row: unknown[]) => Object.fromEntries(names.map((name: string, index: number) => [name, row[index]])))
    .filter((row: Record<string, any>) => row.Employee)
    .map((row: Record<string, any>) => ({
      fullName: String(row.FullName || "").trim(),
      privatePersonId: Number(row.Employee.PrivatePerson),
      // The legal entity (Contractor) this person is employed under — the
      // one field Saby's own directory uses to tell two same-named people
      // apart. Confirmed against real data: two totally different people
      // are both named exactly "Швецова Екатерина Сергеевна" in Saby, one
      // under Contractor 95904 (ООО Парк), the other under 253 (ООО
      // Венусто) — which are exactly the ORG_INTERNAL_IDS values for those
      // organizations, so this is directly comparable to targetOrgInternalId.
      contractorId: row.Employee.Contractor as number,
    }));
}

// The person-picker in Saby's own report dialog defaults "created by" to
// whoever is logged in. Our service account isn't a real logged-in person,
// so document creation reuses Дьякова's identity for these purely
const REPORT_REGULATION_ID = 161042;
const REPORT_TEMPLATE_UUID = "790687a3-85ac-45f0-a63e-43164b3b2a89";
const REPORT_VISUAL_UUID = "199c75b3-d421-46f2-97d9-bb61e2c0c1bf";
const REPORT_DIALOG_SOURCE = {
  binding: { create: "АвансОтчет.CreateSpecial", destroy: "Документ.УдалитьДокументы", format: "АвансОтчет.Список", query: "АвансОтчет.Список", read: "ПрочитатьДляУчастника", update: "WriteForParticipant" },
  endpoint: { contract: "АвансОтчет" },
  idProperty: "@Документ",
  readMetaData: { ИмяОбъекта: "АвансОтчет" },
  updateMetaData: { ИмяОбъекта: "АвансОтчет" },
};

// Creates a blank Авансовый отчет via the same internal call Saby's own
// document dialog uses (field shape confirmed from a HAR capture of the
// user creating one by hand) — unlike СБИС.ЗаписатьДокумент, this never
// tries to resolve a person by name at all: it's created under the fixed
// resolved employee identity and then reinforced by numeric id via
// setReportPerson below, which sidesteps "Не удалось определить
// работающего сотрудника по идентификатору" entirely (confirmed live: that
// error came from the free-text resolver in СБИС.ЗаписатьДокумент, not from
// anything about the employee's own record — this internal path resolved
// every employee that one failed on).
async function createReport(token: string, date: string, privatePersonId: number): Promise<number> {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
  const isoDate = date.split(".").reverse().join("-");
  const result = await sabyInternalCall(token, "АвансОтчет.CreateSpecial", {
    Фильтр: {
      d: [
        true, false, false, false, false, REPORT_DIALOG_SOURCE, "ExpenseReportsWS4/documentDialog:Dialog",
        REPORT_VISUAL_UUID, true, REPORT_TEMPLATE_UUID, privatePersonId, REPORT_REGULATION_ID,
        "Авансовый отчет", privatePersonId, 1, "ExpenseReportsWS4/documentDialog:Dialog", "АвансОтчет",
        "Авансовый отчет", null, "АвансОтчет", -2, isoDate, time,
      ],
      s: [
        { t: "Логическое", n: "allowAdaptive" }, { t: "Логическое", n: "allowSwitchMode" }, { t: "Логическое", n: "chainsOfDocuments" },
        { t: "Логическое", n: "checkLists" }, { t: "Логическое", n: "repeat" }, { t: "JSON-объект", n: "source" },
        { t: "Строка", n: "template" }, { t: "Строка", n: "ВизуальноеПредставление" }, { t: "Логическое", n: "ВызовИзБраузера" },
        { t: "Строка", n: "ИдРегламента" }, { t: "Число целое", n: "ЛицоСоздал" }, { t: "Число целое", n: "Регламент" },
        { t: "Строка", n: "РегламентНазвание" }, { t: "Число целое", n: "Сотрудник" }, { t: "Число целое", n: "ТипДокумента" },
        { t: "Строка", n: "ТипДокумента.ИмяДиалога" }, { t: "Строка", n: "ТипДокумента.ИмяОбъекта" }, { t: "Строка", n: "ТипДокумента.НазваниеКраткое" },
        { t: "Строка", n: "ТипДокумента.ПодТипДокумента" }, { t: "Строка", n: "ТипДокумента.ТипДокумента" }, { t: "Число целое", n: "ФильтрДокументНашаОрганизация" },
        { t: "Дата", n: "Дата" }, { t: "Время", n: "Время" },
      ],
      _type: "record", f: 0,
    },
    ИмяМетода: "АвансОтчет.Список",
  });
  return Number(sabyRecordFields(result)["@Документ"]);
}

// Assigns the report to the real employee in every person-bearing field and
// to the specific venue/branch entity (Лицо3), all by numeric id. The API is
// authenticated with its own service key, so a fixed human creator must not
// leak in from the HAR template used to reverse-engineer this call.
async function setReportPerson(token: string, reportId: number, privatePersonId: number, orgId: number) {
  // ЛицоСоздал/Сотрудник are set correctly once at creation (see createReport)
  // and are apparently immutable afterward — retrying this write against an
  // EXISTING report with ЛицоСоздал included fails with a generic
  // "BeforeUpdateDocument: Невозможно сохранить документ", confirmed live
  // 2026-09-13 against a perfectly normal, non-closed report whose only
  // mismatch versus what we'd write was ЛицоСоздал (still the service
  // account that created it, not the employee). Only Лицо1/Лицо3 are ever
  // missing on a freshly created report and need setting here.
  await sabyInternalCall(token, "АвансОтчет.WriteForParticipant", {
    Запись: {
      d: [reportId, privatePersonId, orgId],
      s: [
        { t: "Число целое", n: "@Документ" }, { t: "Связь", n: "Лицо1" }, { t: "Связь", n: "Лицо3" },
      ],
      _type: "record", f: 0,
    },
    ДопПоля: { ИмяОбъекта: "АвансОтчет" },
  });
}

// Finds this employee's own reports for the given date by numeric Лицо1 —
// far more precise than matching on a name prefix, and works for anyone the
// pre-flight staff lookup already resolved to a real PrivatePerson id.
async function findReportsForPerson(token: string, date: string, privatePersonId: number) {
  const iso = date.split(".").reverse().join("-");
  const result = await sabyInternalCall(token, "АвансОтчет.СписокPY", {
    Фильтр: {
      d: [true, "-2", "АвансОтчет", [], "Все", iso, iso, "-2", [privatePersonId], "-1", [], [], null, null],
      s: [
        { t: "Логическое", n: "IsWasaby" }, { t: "Строка", n: "resetOurOrgValue" }, { t: "Строка", n: "НазваниеТипаДокумента" },
        { t: { n: "Массив", t: "Строка" }, n: "СписокИдО" }, { t: "Строка", n: "ФильтрВладелец" },
        { t: "Дата", n: "ФильтрДатаП" }, { t: "Дата", n: "ФильтрДатаС" }, { t: "Строка", n: "ФильтрДокументНашаОрганизация" },
        { t: { n: "Массив", t: "Число целое" }, n: "ФильтрЛицо1" }, { t: "Строка", n: "ФильтрПоКраткомуСостоянию" },
        { t: { n: "Массив", t: "Строка" }, n: "ФильтрПометкиВкл" }, { t: { n: "Массив", t: "Строка" }, n: "ФильтрПометкиИскл" },
        { t: "Строка", n: "ФильтрСуммаДо" }, { t: "Строка", n: "ФильтрСуммаОт" },
      ], _type: "record", f: 0,
    },
    Сортировка: null,
    Навигация: { d: ["forward", true, 100, null], s: [{ t: "Строка", n: "Direction" }, { t: "Логическое", n: "HasMore" }, { t: "Число целое", n: "Limit" }, { t: "Строка", n: "Position" }], _type: "record", f: 0 },
    ДопПоля: [],
  });
  const names = result.s.map((field: Record<string, any>) => field.n);
  return result.d.filter(Array.isArray).map((row: unknown[]) => Object.fromEntries(names.map((name: string, index: number) => [name, row[index]])));
}

const LINE_VISUAL_UUID = "b1167c66-39f6-442f-b68c-9fc0fbf9aa20";
const LINE_REGULATION_UUID = "345d147e-bc2a-11e4-950b-dbb95cdd08f1";
const LINE_DIALOG_SOURCE = {
  binding: { create: "СоздатьПоВД", format: "СтрАвансОтчет.Список", query: "СписокСВнешДокументами", read: "ПрочитатьДляУчастника", update: "WriteForParticipant" },
  endpoint: { contract: "СтрАвансОтчет" },
  idProperty: "@Документ",
  readMetaData: { ИмяОбъекта: "СтрАвансОтчет" },
  updateMetaData: { ИмяОбъекта: "СтрАвансОтчет" },
};

// Creates one Расходы line under an existing report — by numeric ids only
// (Лицо2 = the category's ExpenseItem id, Лицо3 = the employee), so unlike
// the old СБИС.ЗаписатьДокумент path there's no ambiguous-category-name
// hard-fail to work around either (that only happened because the old path
// resolved a category by free text).
async function createLine(token: string, reportId: number, orgId: number, categoryId: number, privatePersonId: number, date: string): Promise<number> {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
  const isoDate = date.split(".").reverse().join("-");
  const result = await sabyInternalCall(token, "СтрАвансОтчет.СоздатьПоВД", {
    Фильтр: {
      d: [
        true, false, null, false, false, false, LINE_DIALOG_SOURCE, LINE_VISUAL_UUID, true, isoDate, orgId,
        LINE_REGULATION_UUID, categoryId, privatePersonId, privatePersonId, String(reportId), "Расходы",
        privatePersonId, null, null, 2, "", "СтрАвансОтчет", "Наименование авансового отчета", null, "СтрАвансОтчет", time,
      ],
      s: [
        { t: "Логическое", n: "allowAdaptive" }, { t: "Логическое", n: "allowSwitchMode" }, { t: "Строка", n: "attachDocCount" },
        { t: "Логическое", n: "chainsOfDocuments" }, { t: "Логическое", n: "checkLists" }, { t: "Логическое", n: "repeat" },
        { t: "JSON-объект", n: "source" }, { t: "Строка", n: "ВизуальноеПредставление" }, { t: "Логическое", n: "ВызовИзБраузера" },
        { t: "Строка", n: "Дата" }, { t: "Число целое", n: "ДокументНашаОрганизация" }, { t: "Строка", n: "ИдРегламента" },
        { t: "Число целое", n: "Лицо2" }, { t: "Число целое", n: "Лицо3" }, { t: "Число целое", n: "ЛицоСоздал" },
        { t: "Строка", n: "Раздел" }, { t: "Строка", n: "РегламентНазвание" }, { t: "Число целое", n: "Сотрудник" },
        { t: "Строка", n: "СтрокаАвансовогоОтчета.СчетЗатрат" }, { t: "Строка", n: "СчетЗатрат.@ПланСчетов" }, { t: "Число целое", n: "ТипДокумента" },
        { t: "Строка", n: "ТипДокумента.ИмяДиалога" }, { t: "Строка", n: "ТипДокумента.ИмяОбъекта" }, { t: "Строка", n: "ТипДокумента.НазваниеКраткое" },
        { t: "Строка", n: "ТипДокумента.ПодТипДокумента" }, { t: "Строка", n: "ТипДокумента.ТипДокумента" }, { t: "Время", n: "Время" },
      ],
      _type: "record", f: 0,
    },
    ИмяМетода: "СтрАвансОтчет.Список",
  });
  return Number(sabyRecordFields(result)["@Документ"]);
}

// Sets the actual amount and description text on a just-created line — the
// creation call above only sets up structure/categorization, not these.
async function setLineAmountComment(token: string, lineId: number, amount: number, comment: string) {
  await sabyInternalCall(token, "СтрАвансОтчет.WriteForParticipant", {
    Запись: {
      d: [lineId, amount, comment],
      s: [
        { t: "Число целое", n: "@Документ" },
        { t: { n: "Деньги", p: 2 }, n: "ДокументРасширение.Сумма" },
        { t: "Строка", n: "ДокументРасширение.Название" },
      ],
      _type: "record", f: 0,
    },
    ДопПоля: { ИмяОбъекта: "СтрАвансОтчет" },
  });
}

async function listInternalReportLines(token: string, internalReportId: number) {
  const result = await sabyInternalCall(token, "СтрАвансОтчет.СписокСВнешДокументами", {
    Фильтр: { d: [String(internalReportId)], s: [{ t: "Строка", n: "Раздел" }], _type: "record", f: 0 },
    Сортировка: null,
    Навигация: { d: [true, 100, 0], s: [{ t: "Логическое", n: "ЕстьЕще" }, { t: "Число целое", n: "РазмерСтраницы" }, { t: "Число целое", n: "Страница" }], _type: "record", f: 0 },
    ДопПоля: [],
  });
  const names = result.s.map((field: Record<string, any>) => field.n);
  return result.d.filter(Array.isArray).map((row: unknown[]) => {
    const record = Object.fromEntries(names.map((name: string, index: number) => [name, row[index]]));
    const rawId = record["@Документ"];
    return {
      id: Number(Array.isArray(rawId) ? rawId[0] : rawId),
      amount: Number(record["ДокументРасширение.Сумма"]),
      comment: String(record["ДокументРасширение.Название"] || "").trim(),
      categoryId: record["СтрокаАвансовогоОтчета.Аналитика1"],
      attachmentCount: Number(record["КоличествоВложений"] || record["Вложения"] || 0),
    };
  });
}

async function attachReceipt(token: string, lineId: number, receiptUrl: string, receiptName: string) {
  const parsed = new URL(receiptUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "s3.ru1.storage.beget.cloud") throw new Error("Недопустимый адрес чека");
  const source = await fetch(receiptUrl);
  if (!source.ok) throw new Error(`Не удалось скачать чек: ${source.status}`);
  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 15728640) throw new Error("Некорректный размер чека");
  const safeName = receiptName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "receipt.jpg";
  const upload = await fetch("https://disk.saby.ru/disk/api/v1/temp", {
    method: "POST",
    headers: {
      "X-SBISAccessToken": token,
      "Content-Type": source.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "x-object-meta-av-sync": "true",
    },
    body: bytes,
  });
  const uploaded = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploaded.fileid || !uploaded.versionid) throw new Error(`Saby не загрузил чек: ${upload.status}`);
  await sabyInternalCall(token, "СтрАвансОтчет.BindAttachments", {
    fileId: null,
    filters: {
      d: [String(lineId), {
        d: [[`${uploaded.fileid};${uploaded.versionid}`, false, null, false, false, safeName]],
        s: [
          { t: "Строка", n: "Id" }, { t: "Логическое", n: "IsFolder" }, { t: "Строка", n: "InFolder" },
          { t: "Логическое", n: "IsLink" }, { t: "Логическое", n: "GetContent" }, { t: "Строка", n: "FileName" },
        ], _type: "recordset", f: 1,
      }],
      s: [{ t: "Строка", n: "catalogId" }, { t: "Выборка", n: "listFiles" }],
      _type: "record", f: 0,
    },
  });
}

// Sets the category (and venue, when known) on a specific expense line via
// the internal API — the same call the Saby UI itself makes when a person
// picks these from the "Счет затрат" dialog by hand. The external document
// API's by-name category field doesn't reliably stick (see CATEGORY_IDS
// comment above), so every line needs this follow-up regardless of whether
// it was just created or already existed.
//
// СтатьяЗатрат.Название is a separate field from Аналитика1 — Аналитика1 is
// the real accounting classification (this was already being set here
// correctly), but СтатьяЗатрат.Название is what actually drives the bold
// "Статья" label shown at the top of the line in Saby's own document view.
// Without it a line can be correctly classified internally while still
// visibly reading "Прочие расходы" — confirmed live from a HAR capture of
// the user manually correcting one by hand (that exact field was the one
// that changed the on-screen label from "Прочие расходы" to "Коммунальные
// платежи").
async function applyLineAnalytics(token: string, lineId: number, categoryId: number, categoryName: string, venueId: number | null) {
  await sabyInternalCall(token, "СтрАвансОтчет.WriteForParticipant", {
    Запись: {
      d: [lineId, String(categoryId), venueId == null ? null : String(venueId), COST_ACCOUNT_ID, COST_ACCOUNT_NUMBER, COST_ACCOUNT_NAME, categoryName, true, false],
      s: [
        { t: "Число целое", n: "@Документ" },
        { t: "Строка", n: "СтрокаАвансовогоОтчета.Аналитика1" },
        { t: "Строка", n: "СтрокаАвансовогоОтчета.Аналитика2" },
        { t: "Число целое", n: "СтрокаАвансовогоОтчета.СчетЗатрат" },
        { t: "Строка", n: "СчетЗатрат.Номер" },
        { t: "Строка", n: "СчетЗатрат.Название" },
        { t: "Строка", n: "СтатьяЗатрат.Название" },
        { t: "Логическое", n: "РучноеСохранение" },
        { t: "Логическое", n: "СброситьЧерновик" },
      ],
      _type: "record", f: 0,
    },
    ДопПоля: { ИмяОбъекта: "СтрАвансОтчет" },
  });
}

async function syncAdvanceDay(body: Record<string, any>) {
  const employeeName = String(body.employeeName || "").trim();
  if (!employeeName) throw new Error("Не указано имя сотрудника");
  const person = buildPerson(employeeName);
  const hasEmployeeId = body.employeeId !== undefined && body.employeeId !== null;
  const employeeId = hasEmployeeId ? Number(body.employeeId) : 0;
  if (hasEmployeeId && (typeof body.employeeId !== "number" && typeof body.employeeId !== "string" || !Number.isSafeInteger(employeeId) || Number(employeeId) <= 0)) {
    throw new Error("Некорректный ID сотрудника");
  }
  const date = String(body.date || "");
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) throw new Error("Некорректная дата");
  const isoDate = date.split(".").reverse().join("-");
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate > today || isoDate < "2026-01-01") throw new Error("Дата вне разрешенного периода");
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) throw new Error("Некорректное количество расходов");
  const lines = body.lines.map((item: Record<string, any>) => {
    const amount = Number(item.amount);
    const comment = String(item.comment || "").trim();
    const category = String(item.category || "").trim();
    const venue = String(item.venue || "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new Error("Некорректная сумма");
    if (!comment || comment.length > 500 || !category || category.length > 200 || venue.length > 200) throw new Error("Некорректные реквизиты");
    const receiptUrl = String(item.receiptUrl || "").trim();
    const receiptName = String(item.receiptName || "receipt.jpg").trim();
    return { amount: Math.round(amount * 100) / 100, comment, category, venue, receiptUrl, receiptName };
  });

  const orgInn = String(body.organization?.inn || "").trim();
  const flatOrgId = orgInn ? ORG_INTERNAL_IDS[orgInn] || null : MANAGEMENT_ORGANIZATION_ID;
  if (!flatOrgId) throw new Error(`Неизвестное юрлицо (ИНН «${orgInn}»)`);
  // Prefer the specific venue's own branch entity over the flat head
  // organization when we know it (see BRANCH_ORG_IDS) — this is what a
  // report's Лицо3 and each line's ДокументНашаОрганизация actually need to
  // be for Saby to file the expense under that specific restaurant rather
  // than generically under the head office.
  const orgIdForVenue = (venue: string) => (orgInn && venue && BRANCH_ORG_IDS[`${orgInn}:${venue}`]) || flatOrgId;

  const token = await sabyToken();

  // Resolve the employee to one specific, unambiguous person in Saby's own
  // staff directory — see findStaffByName above for why a plain name isn't
  // enough (surname collisions are real: two distinct people are both
  // genuinely named "Швецова Екатерина Сергеевна" in Saby itself). This is
  // The worker supplies the independently verified profile person ID. Confirm
  // both ID and canonical name against the directory; never fall back to a
  // namesake when a supplied ID is missing or disagrees with the name.
  const surnameMatches = await findStaffByName(token, person.Фамилия);
  const exactNameMatches = surnameMatches.filter((candidate) => candidate.fullName === person.Идентификатор);
  let staffMatches = hasEmployeeId
    ? exactNameMatches.filter((candidate) => candidate.privatePersonId === employeeId)
    : exactNameMatches;
  if (!hasEmployeeId && staffMatches.length !== 1) {
    const byOrg = exactNameMatches.filter((candidate) => candidate.contractorId === flatOrgId);
    if (byOrg.length === 1) staffMatches = byOrg;
  }
  // Multiple employment records may refer to the same physical person.
  staffMatches = [...new Map(staffMatches.map((candidate) => [candidate.privatePersonId, candidate])).values()];
  if (staffMatches.length !== 1) {
    throw new Error(
      staffMatches.length === 0
        ? `Сотрудник «${employeeName}» не найден в справочнике СБИС — сверьте ФИО в реестре`
        : `Сотрудник «${employeeName}» неоднозначен в справочнике СБИС (найдено ${staffMatches.length} совпадений)`,
    );
  }
  const privatePersonId = staffMatches[0].privatePersonId;

  // Reuse today's report for this employee+org if one already exists
  // (e.g. a second sync run picking up a line that failed earlier), otherwise
  // create one via the internal dialog flow and assign it to them by id.
  const primaryOrgId = orgIdForVenue(lines[0]?.venue || "");
  const requestedReportId = Number(body.existingReportId || 0);
  const existingReports = requestedReportId ? [] : await findReportsForPerson(token, date, privatePersonId);
  const matchingReport = existingReports.find((report) =>
    Number(report["ДокументНашаОрганизация"]) === primaryOrgId || Number(report.Лицо3) === primaryOrgId
  );
  let reportId = requestedReportId > 0
    ? requestedReportId
    : matchingReport ? Number(Array.isArray(matchingReport["@Документ"]) ? matchingReport["@Документ"][0] : matchingReport["@Документ"]) : 0;
  if (!reportId) {
    reportId = await createReport(token, date, privatePersonId);
  }
  // Also repair reports created by older versions where the HAR author's id
  // (487 / Дьяков) was hardcoded into creator/employee fields.
  await setReportPerson(token, reportId, privatePersonId, primaryOrgId);

  const existingLines = await listInternalReportLines(token, reportId);
  const created: string[] = [];
  const failed: Array<{ comment: string; error: string }> = [];
  let analyticsApplied = 0;

  for (const item of lines) {
    try {
      const existingLine = existingLines.find((line) => line.amount === item.amount && line.comment.toLowerCase() === item.comment.toLowerCase());
      if (existingLine && (!item.receiptUrl || existingLine.attachmentCount > 0)) continue;
      const orgId = orgIdForVenue(item.venue);
      const categoryId = CATEGORY_IDS[item.category] || CATEGORY_IDS["Прочие расходы"];
      const lineId = existingLine?.id || await createLine(token, reportId, orgId, categoryId, privatePersonId, date);
      if (!existingLine) await setLineAmountComment(token, lineId, item.amount, item.comment);
      const venueId = item.venue ? VENUE_IDS[item.venue] || null : null;
      try {
        await applyLineAnalytics(token, lineId, categoryId, item.category, venueId);
        analyticsApplied++;
      } catch {
        // Non-fatal: the line itself (amount/comment/category via Лицо2 at
        // creation) is already correct — this just refreshes Аналитика1/2,
        // which can be picked up again on a future sync of the same day.
      }
      if (item.receiptUrl) await attachReceipt(token, lineId, item.receiptUrl, item.receiptName);
      created.push(item.comment);
    } catch (error) {
      failed.push({ comment: item.comment, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (failed.length) throw new Error(`Не удалось обработать ${failed.length} из ${lines.length}: ${failed.map((f) => `${f.comment} (${f.error})`).join("; ")}`);

  return {
    created: created.length, skipped: lines.length - created.length,
    reportId: String(reportId), internalReportId: reportId,
    analyticsApplied, analyticsSkipped: created.length - analyticsApplied,
  };
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
      if (body.action === "sync-advance-day") {
        if (!identity.cron) return json({ error: "Синхронизация доступна только серверному воркеру" }, 403);
        return json({ ok: true, ...(await syncAdvanceDay(body)) });
      }
      const count = await refresh(String(body.from || ""), String(body.to || ""));
      return json({ ok: true, updatedRows: count, rows: await databaseRows(body.from, body.to) });
    }
    return json({ error: "Метод не поддерживается" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ошибка сервера" }, 400);
  }
});
