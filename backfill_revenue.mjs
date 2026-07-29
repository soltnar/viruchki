import { spawn } from "node:child_process";

const [from = "2025-01-01", to = "2026-07-28"] = process.argv.slice(2);

function endOfMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}

function nextMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10);
}

function runMonth(start, end) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["update_revenue_data.mjs", start, end], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Месяц ${start}: код ${code}`)));
    child.on("error", reject);
  });
}

let cursor = from;
while (cursor <= to) {
  const monthEnd = endOfMonth(cursor);
  const end = monthEnd < to ? monthEnd : to;
  console.log(`Загрузка ${cursor} — ${end}`);
  await runMonth(cursor, end);
  cursor = nextMonth(cursor);
}
