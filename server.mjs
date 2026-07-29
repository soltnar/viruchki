import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
const cache = new Map();
const maxRangeDays = 93;
const publicFiles = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/data/index.json",
  "/README.md",
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateToIso(date) {
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || start > end) throw new Error("Некорректный период");
  const dates = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(dateToIso(cursor));
    if (dates.length > maxRangeDays) {
      throw new Error(`Период не должен превышать ${maxRangeDays} дня`);
    }
  }
  return dates;
}

async function loadDay(date) {
  const cached = cache.get(date);
  if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) return cached.rows;

  const nodeExecutable = process.execPath;
  const script = path.join(root, "saby_internal_report.mjs");
  const { stdout } = await execFileAsync(nodeExecutable, [script, date, date], {
    cwd: root,
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const reportRows = JSON.parse(stdout);
  const rows = reportRows
    .map((row) => ({
      date,
      warehouseId: row.warehouseId,
      restaurant: row.warehouse,
      revenue: Number(row.salesWithReturns ?? row.sales),
      quantity: Number(row.quantity) || 0,
      returns: Number(row.returns) || 0,
    }))
    .filter((row) => row.restaurant && Number.isFinite(row.revenue));

  cache.set(date, { savedAt: Date.now(), rows });
  return rows;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function handleRevenue(request, response, url) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let dates;
  try {
    dates = enumerateDates(from, to);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  try {
    const dailyRows = await mapWithConcurrency(dates, 4, loadDay);
    sendJson(response, 200, {
      from,
      to,
      days: dates.length,
      generatedAt: new Date().toISOString(),
      rows: dailyRows.flat(),
    });
  } catch (error) {
    console.error("Saby revenue request failed", error);
    sendJson(response, 502, {
      error: "Saby временно не вернул отчет. Повторите обновление через несколько секунд.",
    });
  }
}

async function serveStatic(response, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const isMonthlyData = /^\/data\/\d{4}-\d{2}\.json$/.test(normalized);
  if (!publicFiles.has(pathname) && !publicFiles.has(normalized) && !isMonthlyData) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const file = path.join(root, normalized.slice(1));
  try {
    const body = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/revenue") {
    await handleRevenue(request, response, url);
    return;
  }
  if (request.method === "GET") {
    await serveStatic(response, url.pathname);
    return;
  }
  response.writeHead(405, { Allow: "GET" });
  response.end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Revenue dashboard: http://127.0.0.1:${port}`);
});
