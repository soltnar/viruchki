import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Укажите файл месяца");

const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const number = (value) => Number(value) || 0;

const values = payload.rows.map((row) => `(
  ${quote(row.date)}::date,
  ${quote(row.warehouseId)},
  ${quote(row.restaurant)},
  ${number(row.revenue)},
  ${number(row.quantity)},
  ${number(row.returns)}
)`);

if (!values.length) process.exit(0);

process.stdout.write(`
insert into public.revenue_entries
  (sale_date, warehouse_id, restaurant, revenue, quantity, returns)
values
${values.join(",\n")}
on conflict (sale_date, warehouse_id) do update set
  restaurant = excluded.restaurant,
  revenue = excluded.revenue,
  quantity = excluded.quantity,
  returns = excluded.returns,
  updated_at = now();
`);
