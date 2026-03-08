const state = {
  rows: [],
  filteredRows: [],
  expandedGroups: new Set(),
  showWarehouses: true
};

const els = {
  files: document.getElementById("files"),
  restaurantFilter: document.getElementById("restaurantFilter"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  warehouseType: document.getElementById("warehouseType"),
  viewWarehouses: document.getElementById("viewWarehouses"),
  tableBody: document.getElementById("tableBody"),
  dateTotalsBody: document.getElementById("dateTotalsBody"),
  stats: document.getElementById("stats"),
  chart: document.getElementById("chart"),
  debugInfo: document.getElementById("debugInfo"),
  parseNotice: document.getElementById("parseNotice")
};

let chartCtx = null;

els.files.addEventListener("change", handleFiles);
els.restaurantFilter.addEventListener("change", applyFilters);
els.dateFrom.addEventListener("change", applyFilters);
els.dateTo.addEventListener("change", applyFilters);
els.warehouseType.addEventListener("change", applyFilters);
els.tableBody.addEventListener("click", onTableClick);
els.viewWarehouses.addEventListener("change", () => {
  state.showWarehouses = Boolean(els.viewWarehouses.checked);
  renderTable(state.filteredRows);
});

function handleFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (typeof XLSX === "undefined") {
    alert("Библиотека XLSX не загрузилась. Проверьте интернет и обновите страницу (Cmd+Shift+R).");
    return;
  }

  Promise.all(files.map(parseFile))
    .then((results) => {
      const allRows = results.flatMap((r) => r.rows);
      const debugLines = results.flatMap((r) => r.debug);
      const notices = results.flatMap((r) => r.notices);
      state.rows = aggregateRows(allRows);
      state.expandedGroups.clear();
      if (els.debugInfo) {
        els.debugInfo.textContent = `Найдено строк выручки: ${state.rows.length}. ${debugLines.join(" | ")}`;
      }
      if (els.parseNotice) {
        els.parseNotice.textContent = notices.join(" | ");
      }
      console.log("[revenue-debug] results", results);
      if (!state.rows.length) {
        alert("Не удалось найти строки выручки в файле. Проверьте структуру отчета.");
      }
      populateRestaurantFilter(state.rows);
      applyFilters();
    })
    .catch((error) => {
      console.error(error);
      const reason = error && error.message ? `\n\nДетали: ${error.message}` : "";
      alert(`Ошибка чтения файла .xlsx.${reason}`);
    });
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
        const fileRows = [];
        const debug = [];
        const notices = [];
        wb.SheetNames.forEach((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const rangeFix = repairWorksheetRef(ws);
          const rangeInfo = findReportDateRangeFromWorksheet(ws);
          const rangeLabel = rangeInfo && rangeInfo.raw ? rangeInfo.raw : "-";
          const probe = collectSheetProbe(ws);
          let parsed = parsePeriodicByDaysWorksheet(ws, file.name, sheetName);
          if (!parsed.length) {
            parsed = parseSalesReportColumnObjects(ws, file.name, sheetName);
          }
          if (!parsed.length) {
            parsed = parseSalesReportWorksheet(ws, file.name, sheetName);
          }

          // Резервный путь через массив строк для нестандартных форматов.
          const rows = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            blankrows: false,
            defval: ""
          });
          if (!parsed.length) parsed = parseSalesReportSheet(rows, file.name, sheetName);
          if (!parsed.length) parsed = parseSheetRows(rows, file.name, sheetName);

          const expanded = expandRowsByDateRange(parsed, rangeInfo);
          fileRows.push(...expanded.rows);
          debug.push(
            `${file.name}/${sheetName}: ${expanded.rows.length} (base:${parsed.length}, range:${rangeLabel}, mode:${expanded.mode}, ref:${probe.ref}, fixed:${rangeFix}, obj:${probe.objRows}, wsAE:${probe.wsCandidates}, jsonRows:${rows.length}, ex:${probe.examples})`
          );
          if (expanded.notice) notices.push(`${file.name}/${sheetName}: ${expanded.notice}`);
        });
        resolve({ rows: fileRows, debug, notices });
      } catch (e) {
        reject(new Error(`${file.name}: ${e.message || "ошибка парсинга"}`));
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function expandRowsByDateRange(rows, rangeInfo) {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], mode: "empty", notice: "" };
  const datedRows = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")));
  const uniqueDates = new Set(datedRows.map((r) => r.date));
  if (uniqueDates.size > 1) {
    return { rows, mode: "detailed", notice: "" };
  }
  if (!rangeInfo || !rangeInfo.days || rangeInfo.days <= 1) {
    return { rows, mode: "single", notice: "" };
  }

  const dates = listDates(rangeInfo.start, rangeInfo.end);
  if (!dates.length) return { rows, mode: "single", notice: "" };

  const expanded = [];
  rows.forEach((row) => {
    const daily = row.revenue / dates.length;
    dates.forEach((date) => {
      expanded.push({
        ...row,
        date,
        revenue: daily
      });
    });
  });

  return {
    rows: expanded,
    mode: "distributed",
    notice: `в отчете диапазон ${rangeInfo.raw}, детализации по дням нет — сумма распределена равномерно`
  };
}

function listDates(startIso, endIso) {
  const out = [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return out;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function findReportDateRangeFromWorksheet(ws) {
  if (!ws || !ws["!ref"]) return null;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const maxRows = Math.min(range.e.r, range.s.r + 40);
  const maxCols = Math.min(range.e.c, range.s.c + 8);
  const rgx = /(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/;

  for (let r = range.s.r; r <= maxRows; r += 1) {
    let joined = "";
    for (let c = range.s.c; c <= maxCols; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      joined += ` ${cellToText(ws[addr])}`;
    }
    const m = joined.match(rgx);
    if (!m) continue;
    const start = normalizeDate(m[1]);
    const end = normalizeDate(m[2]);
    const days = listDates(start, end).length;
    return { start, end, days, raw: `${m[1]}-${m[2]}` };
  }

  return null;
}

function parsePeriodicByDaysWorksheet(ws, fileName, sheetName) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: "A",
    raw: false,
    defval: "",
    blankrows: false
  });
  if (!Array.isArray(rows) || !rows.length) return [];

  const result = [];
  let currentRestaurant = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const a = String(row.A || "").trim();
    const e = row.E;
    const maybeDate = normalizeAnyDate(a);
    const revenue = toNumber(e);

    if (maybeDate) {
      if (currentRestaurant && revenue != null && revenue > 0) {
        result.push({
          date: maybeDate,
          restaurant: currentRestaurant,
          revenue,
          source: `${fileName} / ${sheetName}`
        });
      }
      continue;
    }

    if (a && isBlockedRestaurantName(a)) {
      currentRestaurant = null;
      continue;
    }

    const restaurant = cleanRestaurantName(a);
    if (restaurant) currentRestaurant = restaurant;
  }

  return result;
}

function normalizeAnyDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const shortMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (shortMatch) {
    const day = shortMatch[1];
    const month = shortMatch[2];
    const yy = Number(shortMatch[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${month}-${day}`;
  }
  const fullMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (fullMatch) return `${fullMatch[3]}-${fullMatch[2]}-${fullMatch[1]}`;
  return null;
}

function repairWorksheetRef(ws) {
  if (!ws) return "-";
  const cells = Object.keys(ws).filter((k) => !k.startsWith("!"));
  if (!cells.length) return ws["!ref"] || "-";

  let minR = Infinity;
  let minC = Infinity;
  let maxR = -1;
  let maxC = -1;

  for (let i = 0; i < cells.length; i += 1) {
    const addr = cells[i];
    const decoded = XLSX.utils.decode_cell(addr);
    if (decoded.r < minR) minR = decoded.r;
    if (decoded.c < minC) minC = decoded.c;
    if (decoded.r > maxR) maxR = decoded.r;
    if (decoded.c > maxC) maxC = decoded.c;
  }

  const fixedRef = XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC }
  });
  ws["!ref"] = fixedRef;
  return fixedRef;
}

function collectSheetProbe(ws) {
  if (!ws || !ws["!ref"]) {
    return { ref: "-", objRows: 0, wsCandidates: 0, examples: "-" };
  }
  const ref = ws["!ref"];
  const objRows = XLSX.utils.sheet_to_json(ws, {
    header: "A",
    raw: false,
    defval: "",
    blankrows: false
  });
  const range = XLSX.utils.decode_range(ref);
  let wsCandidates = 0;
  const examples = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const a = cellToText(ws[XLSX.utils.encode_cell({ r, c: 0 })]);
    const e = cellToText(ws[XLSX.utils.encode_cell({ r, c: 4 })]);
    const restaurant = cleanRestaurantName(a);
    const revenue = toNumber(e);
    if (restaurant && revenue != null && revenue > 0) {
      wsCandidates += 1;
      if (examples.length < 2) examples.push(`${restaurant}=${revenue}`);
    }
  }

  return {
    ref,
    objRows: Array.isArray(objRows) ? objRows.length : 0,
    wsCandidates,
    examples: examples.length ? examples.join(", ") : "-"
  };
}

function parseSalesReportColumnObjects(ws, fileName, sheetName) {
  if (!ws) return [];
  const objRows = XLSX.utils.sheet_to_json(ws, {
    header: "A",
    raw: false,
    defval: "",
    blankrows: false
  });
  if (!Array.isArray(objRows) || !objRows.length) return [];

  const date = findReportDateFromObjectRows(objRows) || "Без даты";
  const parsedRows = [];

  for (let i = 0; i < objRows.length; i += 1) {
    const row = objRows[i] || {};
    const restaurant = cleanRestaurantName(row.A);
    const revenue = toNumber(row.E);

    if (!restaurant || revenue == null || revenue <= 0) continue;
    if (/итог/i.test(restaurant)) continue;

    parsedRows.push({
      date,
      restaurant,
      revenue,
      source: `${fileName} / ${sheetName}`
    });
  }

  return parsedRows;
}

function parseSalesReportWorksheet(ws, fileName, sheetName) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const date = findReportDateFromWorksheet(ws, range) || "Без даты";
  const parsedRows = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const restaurantAddr = XLSX.utils.encode_cell({ r: row, c: 0 });
    const revenueAddr = XLSX.utils.encode_cell({ r: row, c: 4 });
    const restaurantCell = ws[restaurantAddr];
    const revenueCell = ws[revenueAddr];

    const restaurant = cleanRestaurantName(cellToText(restaurantCell));
    const revenue = toNumber(cellToText(revenueCell));

    if (!restaurant || revenue == null || revenue <= 0) continue;
    if (/итог/i.test(restaurant)) continue;

    parsedRows.push({
      date,
      restaurant,
      revenue,
      source: `${fileName} / ${sheetName}`
    });
  }

  return parsedRows;
}

function parseSalesReportSheet(rows, fileName, sheetName) {
  if (!Array.isArray(rows)) return [];
  const date = findReportDate(rows) || "Без даты";
  const parsedRows = [];

  for (let r = 0; r < rows.length; r += 1) {
    const sourceRow = Array.isArray(rows[r]) ? rows[r] : [];
    const restaurant = cleanRestaurantName(sourceRow[0]);
    const revenue = toNumber(sourceRow[4]);

    if (!restaurant || revenue == null || revenue <= 0) continue;
    if (/итог/i.test(restaurant)) continue;

    parsedRows.push({
      date,
      restaurant,
      revenue,
      source: `${fileName} / ${sheetName}`
    });
  }

  return parsedRows;
}

function findReportDateFromObjectRows(objRows) {
  const max = Math.min(objRows.length, 40);
  for (let i = 0; i < max; i += 1) {
    const row = objRows[i] || {};
    const joined = [row.A, row.B, row.C, row.D, row.E].map((v) => String(v || "")).join(" ");
    const date = findDateInRow([joined], true);
    if (date) return date;
  }
  for (let i = 0; i < max; i += 1) {
    const row = objRows[i] || {};
    const joined = [row.A, row.B, row.C, row.D, row.E].map((v) => String(v || "")).join(" ");
    const date = findDateInRow([joined], false);
    if (date) return date;
  }
  return null;
}

function findReportDateFromWorksheet(ws, range) {
  const maxRows = Math.min(range.e.r, range.s.r + 40);
  const maxCols = Math.min(range.e.c, range.s.c + 8);

  for (let r = range.s.r; r <= maxRows; r += 1) {
    let joined = "";
    for (let c = range.s.c; c <= maxCols; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      joined += ` ${cellToText(ws[addr])}`;
    }
    const date = findDateInRow([joined], true);
    if (date) return date;
  }

  for (let r = range.s.r; r <= maxRows; r += 1) {
    let joined = "";
    for (let c = range.s.c; c <= maxCols; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      joined += ` ${cellToText(ws[addr])}`;
    }
    const date = findDateInRow([joined], false);
    if (date) return date;
  }

  return null;
}

function cellToText(cell) {
  if (!cell) return "";
  if (cell.w != null) return String(cell.w).trim();
  if (cell.v != null) return String(cell.v).trim();
  return "";
}

function parseSheetRows(rows, fileName, sheetName) {
  if (!Array.isArray(rows)) return [];
  const parsedRows = [];
  let sheetDate = findReportDate(rows);
  let revenueCol = -1;
  let restaurantCol = -1;

  for (let r = 0; r < rows.length; r += 1) {
    const sourceRow = Array.isArray(rows[r]) ? rows[r] : [];
    const row = sourceRow.map((cell) => String(cell || "").trim());
    if (!row.some(Boolean)) continue;

    const foundDate = findDateInRow(row, true);
    if (foundDate) sheetDate = foundDate;

    const maybeRevenue = row.findIndex((c) => /сумм|продаж|выручк/i.test(c));
    if (maybeRevenue >= 0) revenueCol = maybeRevenue;

    const maybeRestaurant = row.findIndex((c) => /ресторан|склад|точк|филиал|подраздел|выручк/i.test(c));
    if (maybeRestaurant >= 0) restaurantCol = maybeRestaurant;

    let revenue = extractRevenue(row, revenueCol);
    let restaurant = extractRestaurant(row, restaurantCol);

    // Резервный режим для нестандартных строк отчета.
    if (!restaurant) restaurant = extractRestaurantFallback(row);
    if (revenue == null) revenue = extractRevenueFallback(row);

    if (!restaurant || revenue == null) continue;
    if (/итог/i.test(restaurant)) continue;

    parsedRows.push({
      date: sheetDate || "Без даты",
      restaurant,
      revenue,
      source: `${fileName} / ${sheetName}`
    });
  }

  return parsedRows;
}

function findDateInRows(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const date = findDateInRow(rows[i].map((cell) => String(cell || "")));
    if (date) return date;
  }
  return null;
}

function findReportDate(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = rows[i].map((cell) => String(cell || "").trim());
    const date = findDateInRow(row, true);
    if (date) return date;
  }
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = rows[i].map((cell) => String(cell || "").trim());
    const date = findDateInRow(row, false);
    if (date) return date;
  }
  return null;
}

function findDateInRow(row, onlyRange = false) {
  const joined = row.join(" ");
  const rangeMatch = joined.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  if (rangeMatch) return normalizeDate(rangeMatch[1]);

  if (onlyRange) return null;
  if (/построен:/i.test(joined)) return null;

  const oneDate = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (oneDate) return normalizeDate(oneDate[1]);

  return null;
}

function normalizeDate(dmy) {
  const [d, m, y] = dmy.split(".");
  return `${y}-${m}-${d}`;
}

function extractRevenue(row, preferredCol) {
  if (preferredCol >= 0) {
    const v = toNumber(row[preferredCol]);
    if (v != null) return v;
  }

  for (let i = row.length - 1; i >= 0; i -= 1) {
    const v = toNumber(row[i]);
    if (v != null && v !== 0) return v;
  }
  return null;
}

function extractRevenueFallback(row) {
  const nums = row
    .map((cell) => toNumber(cell))
    .filter((v) => v != null && Number.isFinite(v) && v > 0);

  if (!nums.length) return null;
  // В строках отчета обычно есть количество и сумма; сумма чаще всего максимальная.
  return Math.max(...nums);
}

function extractRestaurant(row, preferredCol) {
  if (preferredCol >= 0) {
    const candidate = cleanRestaurantName(row[preferredCol]);
    if (candidate) return candidate;
  }

  for (let i = 0; i < row.length; i += 1) {
    const c = cleanRestaurantName(row[i]);
    if (c) return c;
  }
  return null;
}

function extractRestaurantFallback(row) {
  for (let i = 0; i < row.length; i += 1) {
    const text = cleanRestaurantName(row[i]);
    if (!text) continue;
    // Нужен именно текст с буквами, чтобы не брать служебные коды.
    if (/[A-Za-zА-Яа-яЁё]/.test(text)) return text;
  }
  return null;
}

function cleanRestaurantName(value) {
  const text = String(value || "").trim();
  const key = normalizeNameKey(text);
  if (!text) return null;
  if (/^\d+[.,]?\d*$/.test(text)) return null;
  if (/^отчет по продажам$/i.test(text)) return null;
  if (/^построен:/i.test(text)) return null;
  if (/^детализация:/i.test(text)) return null;
  if (/^наша компания:/i.test(text)) return null;
  if (/^выручки?$/i.test(text)) return null;
  if (/^сумма$/i.test(text)) return null;
  if (/^кол-во$/i.test(text)) return null;
  if (/^ед\.\s*изм\.$/i.test(text)) return null;
  if (/^продажа$/i.test(text)) return null;
  if (isBlockedRestaurantName(text)) return null;
  if (/^\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}$/.test(text)) return null;
  if (/^лист\d*$/i.test(text)) return null;
  return text;
}

function isBlockedRestaurantName(value) {
  const key = normalizeNameKey(value);
  if (!key) return false;
  if (key.includes("онлайн оплата") && key.includes("сбп")) return true;
  if (key === "основной склад") return true;
  if (key.includes("бургер бик") && key.includes("чайка")) return true;
  if (key === "бургер бик") return true;
  if (key.includes("фабрика разделка")) return true;
  if (key.includes("нто ооо приспех") && key.includes("гагарина") && key.includes("35")) return true;
  return false;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\u00a0/g, " ").replace(/\s/g, "");
  // Убираем валюты/текст, оставляем только цифры и разделители.
  s = s.replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "," || s === ".") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "");
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function aggregateRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const parts = splitRestaurantName(row.restaurant);
    const key = `${row.date}__${parts.group}__${parts.warehouse}`;
    const existing = map.get(key);
    if (existing) {
      existing.revenue += row.revenue;
    } else {
      map.set(key, {
        ...row,
        group: parts.group,
        warehouse: parts.warehouse
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.date === b.date) {
      if (a.group === b.group) return a.warehouse.localeCompare(b.warehouse, "ru");
      return a.group.localeCompare(b.group, "ru");
    }
    return a.date.localeCompare(b.date);
  });
}

function populateRestaurantFilter(rows) {
  const restaurants = [...new Set(rows.map((r) => r.group))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  els.restaurantFilter.innerHTML = "";
  restaurants.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    els.restaurantFilter.appendChild(option);
  });
}

function applyFilters() {
  const selectedRestaurants = Array.from(els.restaurantFilter.selectedOptions || []).map((o) => o.value);
  const from = normalizeFilterDate(els.dateFrom.value);
  const to = normalizeFilterDate(els.dateTo.value);
  const selectedWarehouseTypes = Array.from(els.warehouseType.selectedOptions || []).map((o) => o.value);
  const groupWarehouseCount = getGroupWarehouseCount(state.rows);

  state.filteredRows = state.rows.filter((row) => {
    if (selectedRestaurants.length && !selectedRestaurants.includes(row.group)) return false;
    if (from && row.date !== "Без даты" && row.date < from) return false;
    if (to && row.date !== "Без даты" && row.date > to) return false;
    if (!matchesWarehouseType(row, selectedWarehouseTypes, groupWarehouseCount)) return false;
    return true;
  });

  renderStats(state.filteredRows);
  renderDateTotals(state.filteredRows);
  renderTable(state.filteredRows);
  renderChart(state.filteredRows);
}

function matchesWarehouseType(row, selectedTypes, groupWarehouseCount) {
  if (!selectedTypes.length || selectedTypes.includes("all")) return true;
  const kind = getWarehouseKind(row.warehouse);
  const isSingleGroup = (groupWarehouseCount.get(row.group) || 0) === 1;

  if (selectedTypes.includes(kind)) return true;
  if (selectedTypes.includes("single") && isSingleGroup) return true;
  return false;
}

function getWarehouseKind(name) {
  const key = normalizeNameKey(name);
  if (key.includes("кухня")) return "kitchen";
  if (key.includes("бар")) return "bar";
  return "single";
}

function getGroupWarehouseCount(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const set = map.get(row.group) || new Set();
    set.add(row.warehouse);
    map.set(row.group, set);
  });
  const out = new Map();
  map.forEach((set, group) => out.set(group, set.size));
  return out;
}

function normalizeFilterDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return raw;
}

function renderStats(rows) {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  const restaurants = new Set(rows.map((r) => r.group)).size;
  const dates = new Set(rows.map((r) => r.date)).size;

  els.stats.innerHTML = `
    <article class="stat">
      <p class="stat-title">Общая выручка</p>
      <p class="stat-value">${formatMoney(total)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Ресторанов</p>
      <p class="stat-value">${restaurants}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Дней в выборке</p>
      <p class="stat-value">${dates}</p>
    </article>
  `;
}

function renderTable(rows) {
  if (!rows.length) {
    els.tableBody.innerHTML = '<tr><td class="empty" colspan="3">Нет данных по выбранным фильтрам</td></tr>';
    return;
  }

  const grouped = groupRowsForTable(rows);
  const html = [];

  grouped.forEach((group) => {
    const isOpen = state.showWarehouses && state.expandedGroups.has(group.key);
    html.push(`
      <tr class="group-row">
        <td>${formatDate(group.date)}</td>
        <td>
          ${
            state.showWarehouses
              ? `<button class="group-toggle" data-group-key="${escapeHtml(group.key)}">${isOpen ? "▾" : "▸"} ${escapeHtml(group.group)}</button>`
              : `${escapeHtml(group.group)}`
          }
        </td>
        <td class="money">${formatMoney(group.total)}</td>
      </tr>
    `);

    if (state.showWarehouses && isOpen) {
      group.items.forEach((item) => {
        html.push(`
          <tr>
            <td>${formatDate(item.date)}</td>
            <td class="warehouse-name">${escapeHtml(item.warehouse)}</td>
            <td class="money">${formatMoney(item.revenue)}</td>
          </tr>
        `);
      });
    }
  });

  els.tableBody.innerHTML = html.join("");
}

function renderDateTotals(rows) {
  if (!els.dateTotalsBody) return;
  const byDate = new Map();
  rows.forEach((row) => {
    if (row.date === "Без даты") return;
    byDate.set(row.date, (byDate.get(row.date) || 0) + row.revenue);
  });

  const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
  if (!dates.length) {
    els.dateTotalsBody.innerHTML = '<tr><td class="empty" colspan="2">Нет данных по датам</td></tr>';
    return;
  }

  els.dateTotalsBody.innerHTML = dates
    .map(
      (date) => `
      <tr>
        <td>${formatDate(date)}</td>
        <td class="money">${formatMoney(byDate.get(date))}</td>
      </tr>
    `
    )
    .join("");
}

function onTableClick(event) {
  if (!state.showWarehouses) return;
  const btn = event.target.closest(".group-toggle");
  if (!btn) return;
  const key = btn.dataset.groupKey;
  if (!key) return;
  if (state.expandedGroups.has(key)) state.expandedGroups.delete(key);
  else state.expandedGroups.add(key);
  renderTable(state.filteredRows);
}

function groupRowsForTable(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.date}__${row.group}`;
    const bucket = map.get(key) || { key, date: row.date, group: row.group, total: 0, items: [] };
    bucket.total += row.revenue;
    bucket.items.push(row);
    map.set(key, bucket);
  });

  return Array.from(map.values())
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.warehouse.localeCompare(b.warehouse, "ru"))
    }))
    .sort((a, b) => {
      if (a.date === b.date) return a.group.localeCompare(b.group, "ru");
      return a.date.localeCompare(b.date);
    });
}

function splitRestaurantName(name) {
  const original = String(name || "").trim();
  const key = normalizeNameKey(original);
  let group = original;

  if (/моторн/i.test(original) && /(пер|2к1|2\/1)/i.test(original)) {
    group = "Самурай Доставка Моторный пер 2к1";
  }
  else if (/коминтерн/i.test(original) && /166/.test(original)) {
    group = "Самурай Доставка Коминтерна 166";
  }
  else if (/^RIBS\b/i.test(original)) group = "RIBS";
  else if (/^Ресторан XIX\b/i.test(original)) group = "Ресторан XIX";
  else if (key.includes("винедо") || key.includes("vinedo")) group = "ВИНЕДО";
  else if (/^Самурай,\s*/i.test(original)) {
    group = original.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    if (/^Самурай,\s*Октября,/i.test(group) && /(^|[^\d])2([^\d]|$)/.test(group)) {
      group = "Самурай, Октября, 2";
    }
    if (/^Самурай,\s*Веденяпина/i.test(group) && /1А/i.test(group)) {
      group = "Самурай, Веденяпина, 1А";
    }
    if (/^Самурай,\s*(Гагарина,\s*35|Парк Швейцария)/i.test(group)) {
      group = "Самурай, Парк Швейцария";
    }
  }
  else if (/^Детский центр Жюль Верн\b/i.test(original)) group = "Детский центр Жюль Верн";
  else {
    group = original.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  }

  return {
    group: group || original,
    warehouse: original
  };
}

function normalizeNameKey(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\u00a0/g, " ")
    .replace(/[.,;:()\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderChart(rows) {
  const ctx = els.chart.getContext("2d");
  if (!chartCtx) chartCtx = ctx;

  ctx.clearRect(0, 0, els.chart.width, els.chart.height);

  const byDate = new Map();
  rows.forEach((r) => {
    if (r.date === "Без даты") return;
    byDate.set(r.date, (byDate.get(r.date) || 0) + r.revenue);
  });

  const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
  const values = dates.map((d) => byDate.get(d));

  drawSimpleLineChart(ctx, dates, values);
}

function drawSimpleLineChart(ctx, labels, values) {
  const canvas = els.chart;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);

  if (!values.length) {
    ctx.fillStyle = "#5d6a61";
    ctx.font = "14px Manrope";
    ctx.fillText("Нет данных для графика", 12, 24);
    return;
  }

  const padding = { top: 16, right: 16, bottom: 24, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.strokeStyle = "#d8dfd4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((v, i) => {
    const x = padding.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const y = padding.top + (1 - (v - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = "#0f766e";
  values.forEach((v, i) => {
    const x = padding.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const y = padding.top + (1 - (v - min) / range) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#1d2a21";
  ctx.font = "11px Manrope";
  const firstDate = formatDate(labels[0]);
  const lastDate = formatDate(labels[labels.length - 1]);
  ctx.fillText(firstDate, padding.left, height - 6);
  if (labels.length > 1) {
    const textW = ctx.measureText(lastDate).width;
    ctx.fillText(lastDate, width - padding.right - textW, height - 6);
  }

  ctx.fillStyle = "#5d6a61";
  ctx.fillText(formatMoney(max), 8, padding.top + 8);
  ctx.fillText(formatMoney(min), 8, height - padding.bottom);
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatDate(isoDate) {
  if (!isoDate || isoDate === "Без даты") return "Без даты";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

window.addEventListener("resize", () => renderChart(state.filteredRows));
