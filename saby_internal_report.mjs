import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function loadEnv(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (match) result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function setRecordValue(record, name, value) {
  const index = record.s.findIndex((field) => field.n === name);
  if (index < 0) throw new Error(`Поле ${name} не найдено в шаблоне запроса`);
  record.d[index] = value;
}

const [from, to, ...warehouseIds] = process.argv.slice(2);
if (!from || !to) {
  throw new Error(
    "Использование: node saby_internal_report.mjs YYYY-MM-DD YYYY-MM-DD [warehouseId ...]"
  );
}

const env = { ...loadEnv(path.resolve(".env")), ...process.env };
const keyFile = fs.readdirSync(".").find((name) => name.endsWith(".key"));
const serviceKey =
  env.SABY_SERVICE_KEY || (keyFile ? fs.readFileSync(keyFile, "utf8").trim() : "");
if (!env.SABY_APP_CLIENT_ID || !env.SABY_APP_SECRET || !serviceKey) {
  throw new Error("Не заданы SABY_APP_CLIENT_ID, SABY_APP_SECRET или SABY_SERVICE_KEY");
}

const authResponse = await fetch("https://online.sbis.ru/oauth/service/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    app_client_id: env.SABY_APP_CLIENT_ID,
    app_secret: env.SABY_APP_SECRET,
    secret_key: serviceKey,
  }),
});
const auth = await authResponse.json();
if (!authResponse.ok || !auth.token) {
  throw new Error(`Ошибка авторизации Saby: ${authResponse.status}`);
}

const filter = {
  d: [
    "1",
    "SalesAnalytics.GetDataWithoutCaching",
    33,
    "P30DT0H0M0S",
    null,
    "Period",
    null,
    randomUUID(),
    true,
    "Warehouse_Stats/VDWarehouseReports/WarehouseReport/Reports/Sales/SalesReportUnion:openNewWindow",
    ["Склад", "Дата"],
    "day",
    true,
    false,
    false,
    to,
    null,
    from,
    null,
    null,
    null,
    [],
    [from, to, null, null],
    warehouseIds,
    null,
    null,
  ],
  s: [
    { t: "Строка", n: "PrefetchLevels" },
    { t: "Строка", n: "PrefetchMethod" },
    { t: "Число целое", n: "PrefetchPages" },
    { t: "Строка", n: "PrefetchSessionLiveTime" },
    { t: "Строка", n: "Product" },
    { t: "Строка", n: "ReportMode" },
    { t: "Строка", n: "hasCharacteristics" },
    { t: "Строка", n: "modalOperationToken" },
    { t: "Логическое", n: "pathEnable" },
    { t: "Строка", n: "resultMethod" },
    { t: { n: "Массив", t: "Строка" }, n: "Детализация" },
    { t: "Строка", n: "ДетализацияПериод" },
    { t: "Логическое", n: "ИерархияНоменклатура" },
    { t: "Логическое", n: "ИерархияОрганизацияФилиал" },
    { t: "Логическое", n: "ИерархияСотрудник" },
    { t: "Дата", n: "ПериодКонец" },
    { t: "Строка", n: "ПериодКонецАнализ" },
    { t: "Дата", n: "ПериодНачало" },
    { t: "Строка", n: "ПериодНачалоАнализ" },
    { t: "Строка", n: "Раздел" },
    { t: "Строка", n: "РежимФильтраПрайс" },
    { t: { n: "Массив", t: "Строка" }, n: "ФильтрНоменклатура" },
    { t: { n: "Массив", t: "Дата" }, n: "ФильтрПериод" },
    { t: { n: "Массив", t: "Строка" }, n: "ФильтрСклад" },
    { t: "Строка", n: "ФильтрЦены" },
    { t: "Строка", n: "ФильтрЦеныДата" },
  ],
  _type: "record",
  f: 0,
};

const request = {
  jsonrpc: "2.0",
  protocol: 7,
  method: "SalesAnalytics.GetData",
  params: {
    "Фильтр": filter,
    "Сортировка": {
      d: [[false, "СуммаЦен", true]],
      s: [
        { t: "Логическое", n: "l" },
        { t: "Строка", n: "n" },
        { t: "Логическое", n: "o" },
      ],
      _type: "recordset",
      f: 0,
    },
    "Навигация": {
      d: [true, 200, 0],
      s: [
        { t: "Логическое", n: "ЕстьЕще" },
        { t: "Число целое", n: "РазмерСтраницы" },
        { t: "Число целое", n: "Страница" },
      ],
      _type: "record",
      f: 0,
    },
    "ДопПоля": [],
  },
  id: 1,
};

async function callReport() {
  const response = await fetch("https://online.saby.ru/service/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-SBISAccessToken": auth.token,
      "X-CalledMethod": "SalesAnalytics.GetData",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(
      `Ошибка SalesAnalytics.GetData: ${response.status} ${JSON.stringify(data.error)}`
    );
  }
  return data;
}

function recordToObject(record) {
  if (!record?.s || !record?.d) return {};
  return Object.fromEntries(record.s.map((field, index) => [field.n, record.d[index]]));
}

let data = await callReport();
let session = recordToObject(data.result.r).PrefetchSessionId;
if (session && !filter.s.some((field) => field.n === "PrefetchSessionId")) {
  const insertAt = filter.s.findIndex((field) => field.n === "PrefetchPages") + 1;
  filter.s.splice(insertAt, 0, { t: "Строка", n: "PrefetchSessionId" });
  filter.d.splice(insertAt, 0, session);
}

for (let attempt = 0; attempt < 12 && data.result.d.length === 0 && session; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  data = await callReport();
  session = recordToObject(data.result.r).PrefetchSessionId ?? session;
  setRecordValue(filter, "PrefetchSessionId", session);
}

const names = data.result.s.map((field) => field.n);
const rows = data.result.d.map((values) =>
  Object.fromEntries(names.map((name, index) => [name, values[index]]))
);

if (rows.length === 0) {
  console.error(
    JSON.stringify(
      {
        resultType: data.result._type,
        fields: names,
        navigation: data.result.n,
        references: data.result.r,
      },
      null,
      2
    )
  );
}

console.log(
  JSON.stringify(
    rows.map((row) => ({
      warehouseId: row.wh,
      warehouse: row["Склад.Название"],
      date: row.Date ?? row["Дата.Полная"],
      quantity: row.Количество,
      returnsQuantity: row.ВозвратКоличество,
      sales: row.СуммаЦен,
      returns: row.ВозвратСуммаЦен,
      salesWithReturns: row.СуммаЦенСВозвратами,
    })),
    null,
    2
  )
);
