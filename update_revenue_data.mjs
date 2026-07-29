import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const manifestFile = path.join(dataDir, "index.json");
const [fromArg, toArg] = process.argv.slice(2);

function moscowDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function datesBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Некорректный период");
  }
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > 400) throw new Error("За один запуск можно обновить не более 400 дней");
  }
  return dates;
}

async function readMonth(month) {
  try {
    const payload = JSON.parse(await fs.readFile(path.join(dataDir, `${month}.json`), "utf8"));
    return Array.isArray(payload.rows) ? payload.rows : [];
  } catch {
    return [];
  }
}

async function loadDay(date) {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, "saby_internal_report.mjs"),
    date,
    date,
  ], {
    cwd: root,
    env: process.env,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout)
    .map((row) => ({
      date,
      warehouseId: String(row.warehouseId ?? ""),
      restaurant: String(row.warehouse ?? "").trim(),
      revenue: Number(row.salesWithReturns ?? row.sales),
      quantity: Number(row.quantity) || 0,
      returns: Number(row.returns) || 0,
    }))
    .filter((row) => row.restaurant && Number.isFinite(row.revenue));
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const from = fromArg || moscowDate(-1);
const to = toArg || from;
const dates = datesBetween(from, to);
const updated = (await mapWithConcurrency(dates, 4, loadDay)).flat();
const datesByMonth = new Map();
for (const date of dates) {
  const month = date.slice(0, 7);
  if (!datesByMonth.has(month)) datesByMonth.set(month, new Set());
  datesByMonth.get(month).add(date);
}

await fs.mkdir(dataDir, { recursive: true });
for (const [month, monthDates] of datesByMonth) {
  const rows = (await readMonth(month))
    .filter((row) => !monthDates.has(row.date))
    .concat(updated.filter((row) => row.date.startsWith(month)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.restaurant.localeCompare(b.restaurant, "ru"));
  await fs.writeFile(path.join(dataDir, `${month}.json`), `${JSON.stringify({
    month,
    generatedAt: new Date().toISOString(),
    rows,
  })}\n`);
}

const files = (await fs.readdir(dataDir))
  .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
  .sort();
const months = [];
let minDate = null;
let maxDate = null;
for (const file of files) {
  const payload = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  const monthRows = Array.isArray(payload.rows) ? payload.rows : [];
  for (const row of monthRows) {
    if (!minDate || row.date < minDate) minDate = row.date;
    if (!maxDate || row.date > maxDate) maxDate = row.date;
  }
  months.push({
    month: file.slice(0, 7),
    generatedAt: payload.generatedAt,
    rows: monthRows.length,
  });
}
await fs.writeFile(manifestFile, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  minDate,
  maxDate,
  months,
}, null, 2)}\n`);

console.log(`Обновлено ${dates.length} дн., получено ${updated.length} строк.`);
