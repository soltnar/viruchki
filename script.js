const state = {
  rows: [],
  filteredRows: [],
  expandedGroups: new Set(),
  showWarehouses: true,
  detailSort: "revenue_desc",
  compareOptions: [],
  chartMeta: null
};

const DEBUG_LOG_KEY = "revenue_debug_log_v1";

const els = {
  files: document.getElementById("files"),
  restaurantFilter: document.getElementById("restaurantFilter"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  warehouseType: document.getElementById("warehouseType"),
  compareMode: document.getElementById("compareMode"),
  comparePeriodA: document.getElementById("comparePeriodA"),
  comparePeriodB: document.getElementById("comparePeriodB"),
  comparePeriodAGroup: document.getElementById("comparePeriodAGroup"),
  comparePeriodBGroup: document.getElementById("comparePeriodBGroup"),
  comparePrevFrom: document.getElementById("comparePrevFrom"),
  comparePrevTo: document.getElementById("comparePrevTo"),
  compareCustomGroup: document.getElementById("compareCustomGroup"),
  compareStats: document.getElementById("compareStats"),
  viewWarehouses: document.getElementById("viewWarehouses"),
  detailSort: document.getElementById("detailSort"),
  detailGroupBy: document.getElementById("detailGroupBy"),
  expandAllRows: document.getElementById("expandAllRows"),
  collapseAllRows: document.getElementById("collapseAllRows"),
  exportExcel: document.getElementById("exportExcel"),
  exportPdf: document.getElementById("exportPdf"),
  downloadLog: document.getElementById("downloadLog"),
  tableBody: document.getElementById("tableBody"),
  dateTotalsBody: document.getElementById("dateTotalsBody"),
  stats: document.getElementById("stats"),
  chart: document.getElementById("chart"),
  chartTooltip: document.getElementById("chartTooltip")
};

let chartCtx = null;

initDebugLogging();

els.files.addEventListener("change", handleFiles);
els.restaurantFilter.addEventListener("change", applyFilters);
els.dateFrom.addEventListener("change", applyFilters);
els.dateTo.addEventListener("change", applyFilters);
els.warehouseType.addEventListener("change", applyFilters);
els.compareMode.addEventListener("change", () => {
  toggleCompareCustom();
  updateComparePeriodSelectors(state.rows);
  applyFilters();
});
els.comparePeriodA.addEventListener("change", applyFilters);
els.comparePeriodB.addEventListener("change", applyFilters);
els.comparePrevFrom.addEventListener("change", applyFilters);
els.comparePrevTo.addEventListener("change", applyFilters);
els.tableBody.addEventListener("click", onTableClick);
els.viewWarehouses.addEventListener("change", () => {
  state.showWarehouses = Boolean(els.viewWarehouses.checked);
  updateWarehouseActionButtons();
  renderTable(state.filteredRows);
});
els.detailSort.addEventListener("change", () => {
  state.detailSort = els.detailSort.value || "revenue_desc";
  renderTable(state.filteredRows);
});
els.detailGroupBy.addEventListener("change", () => {
  state.expandedGroups.clear();
  renderTable(state.filteredRows);
  renderDateTotals(state.filteredRows);
});
els.expandAllRows.addEventListener("click", expandAllGroups);
els.collapseAllRows.addEventListener("click", collapseAllGroups);
els.exportExcel.addEventListener("click", exportToExcelPivot);
els.exportPdf.addEventListener("click", exportToPdf);
els.downloadLog.addEventListener("click", downloadDebugLog);
els.chart.addEventListener("mousemove", onChartPointerMove);
els.chart.addEventListener("mouseleave", hideChartTooltip);
els.chart.addEventListener("touchstart", onChartPointerMove, { passive: true });
els.chart.addEventListener("touchmove", onChartPointerMove, { passive: true });
els.chart.addEventListener("touchend", hideChartTooltip);
toggleCompareCustom();
updateWarehouseActionButtons();

function handleFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (typeof XLSX === "undefined") {
    appendDebugLog("error", "xlsx_not_loaded", {});
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
      appendDebugLog("info", "file_parse_summary", {
        rows_count: state.rows.length,
        debug: debugLines,
        notices
      });
      if (!state.rows.length) {
        appendDebugLog("warn", "no_rows_found", { files: files.map((f) => f.name) });
        alert("Не удалось найти строки выручки в файле. Проверьте структуру отчета.");
      }
      populateRestaurantFilter(state.rows);
      updateComparePeriodSelectors(state.rows);
      applyFilters();
    })
    .catch((error) => {
      console.error(error);
      const reason = error && error.message ? `\n\nДетали: ${error.message}` : "";
      appendDebugLog("error", "file_parse_failed", {
        message: error && error.message ? error.message : "unknown_error"
      });
      alert(`Ошибка чтения файла .xlsx.${reason}`);
    });
}

function appendDebugLog(level, event, data) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.push({
    ts: new Date().toISOString(),
    level,
    event,
    data
  });
  if (list.length > 500) list = list.slice(list.length - 500);
  localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(list));
}

function initDebugLogging() {
  appendDebugLog("info", "app_start", { version: "2026-03-10.41" });
  window.addEventListener("error", (evt) => {
    appendDebugLog("error", "window_error", {
      message: evt.message || "unknown_window_error",
      file: evt.filename || "",
      line: evt.lineno || 0,
      column: evt.colno || 0
    });
  });
  window.addEventListener("unhandledrejection", (evt) => {
    const reason = evt.reason && evt.reason.message ? evt.reason.message : String(evt.reason || "");
    appendDebugLog("error", "unhandled_rejection", { reason });
  });
}

function downloadDebugLog() {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  const payload = {
    appVersion: "2026-03-08.28",
    exportedAt: new Date().toISOString(),
    logs: list
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "debug-log.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  if (key.includes("шале") && key.includes("15")) return true;
  if (key.includes("совнаркомовская") && key.includes("13")) return true;
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

  const baseRows = state.rows.filter((row) => {
    if (selectedRestaurants.length && !selectedRestaurants.includes(row.group)) return false;
    if (!matchesWarehouseType(row, selectedWarehouseTypes, groupWarehouseCount)) return false;
    return true;
  });

  state.filteredRows = baseRows.filter((row) => {
    if (from && row.date !== "Без даты" && row.date < from) return false;
    if (to && row.date !== "Без даты" && row.date > to) return false;
    return true;
  });

  renderStats(state.filteredRows);
  renderComparison(baseRows, from, to);
  renderDateTotals(state.filteredRows);
  renderTable(state.filteredRows);
  renderChart(baseRows, from, to);
}

function toggleCompareCustom() {
  const isCustom = (els.compareMode.value || "wow") === "custom";
  const customGroups = document.querySelectorAll(".compare-custom");
  customGroups.forEach((el) => el.classList.toggle("visible", isCustom));
  const presetGroups = document.querySelectorAll(".compare-preset");
  presetGroups.forEach((el) => el.classList.toggle("visible", !isCustom));
}

function renderComparison(rows, from, to) {
  const currentRange = resolveCurrentRange(rows, from, to);
  if (!currentRange) {
    els.compareStats.innerHTML = '<article class="stat"><p class="stat-title">Сравнение</p><p class="stat-value">Выберите период</p></article>';
    return;
  }

  const mode = els.compareMode.value || "wow";
  const previousRange = resolvePreviousRange(currentRange, mode);
  if (!previousRange) {
    els.compareStats.innerHTML = '<article class="stat"><p class="stat-title">Сравнение</p><p class="stat-value">Укажите предыдущий период</p></article>';
    return;
  }

  const currentTotal = sumByRange(rows, currentRange.from, currentRange.to);
  const previousTotal = sumByRange(rows, previousRange.from, previousRange.to);
  const diff = currentTotal - previousTotal;
  const pct = previousTotal === 0 ? null : (diff / previousTotal) * 100;

  els.compareStats.innerHTML = `
    <article class="stat">
      <p class="stat-title">Текущий период (${formatDate(currentRange.from)} - ${formatDate(currentRange.to)})</p>
      <p class="stat-value">${formatMoney(currentTotal)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Предыдущий период (${formatDate(previousRange.from)} - ${formatDate(previousRange.to)})</p>
      <p class="stat-value">${formatMoney(previousTotal)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Разница</p>
      <p class="stat-value">${diff >= 0 ? "+" : ""}${formatMoney(diff)}${pct == null ? "" : ` (${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%)`}</p>
    </article>
  `;
}

function resolveCurrentRange(rows, from, to) {
  if (from && to) return { from, to };
  const dated = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")));
  if (!dated.length) return null;
  const dates = dated.map((r) => r.date).sort((a, b) => a.localeCompare(b));
  return { from: from || dates[0], to: to || dates[dates.length - 1] };
}

function resolvePreviousRange(currentRange, mode) {
  if (!currentRange) return null;
  if (mode === "custom") {
    const prevFrom = normalizeFilterDate(els.comparePrevFrom.value);
    const prevTo = normalizeFilterDate(els.comparePrevTo.value);
    if (!prevFrom || !prevTo) return null;
    return { from: prevFrom, to: prevTo };
  }
  const selectedA = els.comparePeriodA.value;
  const selectedB = els.comparePeriodB.value;
  if (selectedA && selectedB) {
    const optA = state.compareOptions.find((o) => o.key === selectedA);
    const optB = state.compareOptions.find((o) => o.key === selectedB);
    if (optA && optB) {
      currentRange.from = optA.from;
      currentRange.to = optA.to;
      return { from: optB.from, to: optB.to };
    }
  }
  const fromDate = isoToDate(currentRange.from);
  const toDate = isoToDate(currentRange.to);
  if (!fromDate || !toDate) return null;

  if (mode === "wow") {
    return {
      from: dateToIso(addDays(fromDate, -7)),
      to: dateToIso(addDays(toDate, -7))
    };
  }
  if (mode === "mom") {
    return {
      from: dateToIso(addMonths(fromDate, -1)),
      to: dateToIso(addMonths(toDate, -1))
    };
  }
  return {
    from: dateToIso(addYears(fromDate, -1)),
    to: dateToIso(addYears(toDate, -1))
  };
}

function sumByRange(rows, from, to) {
  return rows
    .filter((r) => r.date !== "Без даты" && r.date >= from && r.date <= to)
    .reduce((sum, r) => sum + r.revenue, 0);
}

function isoToDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, days) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d, months) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function addYears(d, years) {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function updateComparePeriodSelectors(rows) {
  const mode = els.compareMode.value || "wow";
  state.compareOptions = buildCompareOptions(rows, mode);
  fillCompareSelect(els.comparePeriodA, state.compareOptions);
  fillCompareSelect(els.comparePeriodB, state.compareOptions);
  if (state.compareOptions.length >= 2) {
    els.comparePeriodA.value = state.compareOptions[0].key;
    els.comparePeriodB.value = state.compareOptions[1].key;
  } else if (state.compareOptions.length === 1) {
    els.comparePeriodA.value = state.compareOptions[0].key;
    els.comparePeriodB.value = state.compareOptions[0].key;
  }
}

function fillCompareSelect(selectEl, options) {
  selectEl.innerHTML = "";
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.key;
    o.textContent = opt.label;
    selectEl.appendChild(o);
  });
}

function buildCompareOptions(rows, mode) {
  const dates = [...new Set(rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort(
    (a, b) => b.localeCompare(a)
  );
  if (!dates.length) return [];
  const map = new Map();
  dates.forEach((iso) => {
    const d = isoToDate(iso);
    if (!d) return;
    if (mode === "mom") {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const to = dateToIso(last);
      map.set(key, { key, label: `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`, from, to });
      return;
    }
    if (mode === "yoy") {
      const y = d.getFullYear();
      const key = String(y);
      map.set(key, { key, label: String(y), from: `${y}-01-01`, to: `${y}-12-31` });
      return;
    }
    const start = getWeekStart(d);
    const end = addDays(start, 6);
    const key = `${dateToIso(start)}`;
    map.set(key, { key, label: `${formatDate(dateToIso(start))} - ${formatDate(dateToIso(end))}`, from: dateToIso(start), to: dateToIso(end) });
  });
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function getWeekStart(d) {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
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
        <td>${escapeHtml(group.periodLabel)}</td>
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
            <td>${escapeHtml(group.periodLabel)}</td>
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
  const groupBy = els.detailGroupBy.value || "day";
  const byPeriod = new Map();
  rows.forEach((row) => {
    if (row.date === "Без даты") return;
    const period = getPeriodInfo(row.date, groupBy);
    const bucket = byPeriod.get(period.key) || { label: period.label, sortDate: period.sortDate, total: 0 };
    bucket.total += row.revenue;
    byPeriod.set(period.key, bucket);
  });

  const periods = Array.from(byPeriod.values()).sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  if (!periods.length) {
    els.dateTotalsBody.innerHTML = '<tr><td class="empty" colspan="2">Нет данных по датам</td></tr>';
    return;
  }

  els.dateTotalsBody.innerHTML = periods
    .map(
      (period) => `
      <tr>
        <td>${escapeHtml(period.label)}</td>
        <td class="money">${formatMoney(period.total)}</td>
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

function expandAllGroups() {
  if (!state.showWarehouses) return;
  groupRowsForTable(state.filteredRows).forEach((g) => state.expandedGroups.add(g.key));
  renderTable(state.filteredRows);
}

function collapseAllGroups() {
  state.expandedGroups.clear();
  renderTable(state.filteredRows);
}

function updateWarehouseActionButtons() {
  const disabled = !state.showWarehouses;
  if (els.expandAllRows) els.expandAllRows.disabled = disabled;
  if (els.collapseAllRows) els.collapseAllRows.disabled = disabled;
}

function groupRowsForTable(rows) {
  const groupBy = els.detailGroupBy.value || "day";
  const map = new Map();
  rows.forEach((row) => {
    const period = getPeriodInfo(row.date, groupBy);
    const key = `${period.key}__${row.group}`;
    const bucket =
      map.get(key) ||
      { key, date: period.sortDate, periodLabel: period.label, periodKey: period.key, group: row.group, total: 0, warehouseMap: new Map() };
    bucket.total += row.revenue;
    bucket.warehouseMap.set(row.warehouse, (bucket.warehouseMap.get(row.warehouse) || 0) + row.revenue);
    map.set(key, bucket);
  });

  return Array.from(map.values())
    .map((g) => ({
      ...g,
      items: Array.from(g.warehouseMap.entries())
        .map(([warehouse, revenue]) => ({ warehouse, revenue }))
        .sort((a, b) => a.warehouse.localeCompare(b.warehouse, "ru"))
    }))
    .sort(sortGroupRows);
}

function sortGroupRows(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (state.detailSort === "name_asc") return a.group.localeCompare(b.group, "ru");
  if (state.detailSort === "name_desc") return b.group.localeCompare(a.group, "ru");
  return b.total - a.total;
}

function getPeriodInfo(isoDate, mode) {
  if (!isoDate || isoDate === "Без даты") {
    return { key: "Без даты", label: "Без даты", sortDate: "9999-12-31" };
  }
  const d = isoToDate(isoDate);
  if (!d) return { key: isoDate, label: isoDate, sortDate: isoDate };

  if (mode === "month") {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return {
      key: `${y}-${m}`,
      label: `${m}.${y}`,
      sortDate: `${y}-${m}-01`
    };
  }

  if (mode === "week") {
    const ws = getWeekStart(d);
    const we = addDays(ws, 6);
    const wKey = dateToIso(ws);
    return {
      key: `week-${wKey}`,
      label: `${formatDate(dateToIso(ws))} - ${formatDate(dateToIso(we))}`,
      sortDate: wKey
    };
  }

  return {
    key: isoDate,
    label: formatDate(isoDate),
    sortDate: isoDate
  };
}

function exportToPdf() {
  window.print();
}

function exportToExcelPivot() {
  if (!state.filteredRows.length) {
    alert("Нет данных для экспорта.");
    return;
  }

  const dateSet = new Set();
  const restaurantMap = new Map();
  state.filteredRows.forEach((row) => {
    if (!row.date || row.date === "Без даты") return;
    dateSet.add(row.date);
    const m = restaurantMap.get(row.group) || new Map();
    m.set(row.date, (m.get(row.date) || 0) + row.revenue);
    restaurantMap.set(row.group, m);
  });

  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  if (!dates.length) {
    alert("Нет дат для экспорта.");
    return;
  }

  const header = ["Ресторан", ...dates.map((d) => formatDate(d)), "Итого"];
  const body = [];

  const totalRow = ["Итого"];
  let grandTotal = 0;
  dates.forEach((date) => {
    let daySum = 0;
    restaurantMap.forEach((dateMap) => {
      daySum += dateMap.get(date) || 0;
    });
    totalRow.push(round2(daySum));
    grandTotal += daySum;
  });
  totalRow.push(round2(grandTotal));
  body.push(totalRow);

  const restaurants = Array.from(restaurantMap.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  restaurants.forEach((restaurant) => {
    const dateMap = restaurantMap.get(restaurant);
    const row = [restaurant];
    let rowTotal = 0;
    dates.forEach((date) => {
      const value = dateMap.get(date) || 0;
      row.push(round2(value));
      rowTotal += value;
    });
    row.push(round2(rowTotal));
    body.push(row);
  });

  const aoa = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Выручка");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `выручка_по_ресторанам_${stamp}.xlsx`);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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

function renderChart(baseRows, from, to) {
  const ctx = els.chart.getContext("2d");
  if (!chartCtx) chartCtx = ctx;
  hideChartTooltip();

  const ranges = resolveChartRanges(baseRows, from, to);
  if (!ranges) {
    state.chartMeta = null;
    hideChartTooltip();
    drawRevenueChart(ctx, [], [], [], null);
    return;
  }

  const currentDates = buildDateRange(ranges.current.from, ranges.current.to);
  const previousFromDate = isoToDate(ranges.previous.from);
  const previousToDate = isoToDate(ranges.previous.to);
  const hasValidPreviousRange = Boolean(previousFromDate && previousToDate);
  const currentByDate = aggregateByDate(baseRows, ranges.current.from, ranges.current.to);
  const previousByDate = aggregateByDate(baseRows, ranges.previous.from, ranges.previous.to);

  const currentValues = currentDates.map((d) => currentByDate.get(d) || 0);
  const previousValues = currentDates.map((_, index) => {
    if (!hasValidPreviousRange) return null;
    const pd = addDays(previousFromDate, index);
    const pIso = dateToIso(pd);
    if (pd > previousToDate) return null;
    return previousByDate.get(pIso) || 0;
  });

  state.chartMeta = drawRevenueChart(ctx, currentDates, currentValues, previousValues, ranges);
}

function drawRevenueChart(ctx, labels, values, previousValues, ranges) {
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
    state.chartMeta = null;
    ctx.fillStyle = "#5d6a61";
    ctx.font = "14px Manrope";
    ctx.fillText("Нет данных для графика", 12, 24);
    return null;
  }

  const padding = { top: 54, right: 16, bottom: 30, left: 74 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const previousOnlyNumbers = previousValues.filter((v) => v != null);
  const max = Math.max(...values, ...(previousOnlyNumbers.length ? previousOnlyNumbers : [0]));
  const yMax = max > 0 ? max * 1.08 : 1;
  const yMin = 0;
  const yRange = yMax - yMin;
  const stepX = labels.length === 1 ? 0 : plotW / (labels.length - 1);
  const avg7 = getMovingAverage(values, 7);

  const total = values.reduce((s, v) => s + v, 0);
  const avg = total / values.length;
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const maxIndex = values.findIndex((v) => v === maxValue);
  const minIndex = values.findIndex((v) => v === minValue);

  // Grid and Y labels
  const gridLines = 5;
  ctx.strokeStyle = "#e7ece6";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6a756d";
  ctx.font = "11px Manrope";
  for (let i = 0; i <= gridLines; i += 1) {
    const ratio = i / gridLines;
    const y = padding.top + ratio * plotH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const val = yMax - ratio * yRange;
    const txt = formatMoneyCompact(val);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, padding.left - tw - 8, y + 4);
  }

  // Axes
  ctx.strokeStyle = "#cfd8cf";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  // Bars
  const barW = Math.max(3, Math.min(16, stepX * 0.6 || plotW * 0.5));
  ctx.fillStyle = "rgba(15, 118, 110, 0.32)";
  values.forEach((v, i) => {
    const xCenter = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
    const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
    const h = height - padding.bottom - y;
    ctx.fillRect(xCenter - barW / 2, y, barW, h);
  });

  // 7-day average line
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let startedAvgLine = false;
  avg7.forEach((v, i) => {
    if (v == null) return;
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
    const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
    if (startedAvgLine) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      startedAvgLine = true;
    }
  });
  ctx.stroke();

  // Previous period line
  const hasPreviousData = previousValues.some((v) => v != null);
  if (hasPreviousData) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let startedPrevLine = false;
    previousValues.forEach((v, i) => {
      if (v == null) return;
      const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
      const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
      if (startedPrevLine) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        startedPrevLine = true;
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Min/Max markers
  drawDot(ctx, labels.length === 1 ? padding.left + plotW / 2 : padding.left + maxIndex * stepX, padding.top + (1 - (maxValue - yMin) / yRange) * plotH, "#0f766e");
  drawDot(ctx, labels.length === 1 ? padding.left + plotW / 2 : padding.left + minIndex * stepX, padding.top + (1 - (minValue - yMin) / yRange) * plotH, "#5d6a61");

  ctx.fillStyle = "#1d2a21";
  ctx.font = "11px Manrope";
  const maxLabel = `MAX: ${formatMoneyCompact(maxValue)} (${formatDate(labels[maxIndex])})`;
  const minLabel = `MIN: ${formatMoneyCompact(minValue)} (${formatDate(labels[minIndex])})`;
  ctx.fillText(maxLabel, padding.left, 14);
  ctx.fillText(minLabel, padding.left, 30);
  ctx.fillText(`СРЕДНЕЕ: ${formatMoneyCompact(avg)} | ИТОГО: ${formatMoneyCompact(total)}`, padding.left, 46);

  // X labels
  const ticks = getTickIndexes(labels.length, 6);
  ctx.fillStyle = "#1d2a21";
  ctx.font = "11px Manrope";
  ticks.forEach((idx) => {
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + idx * stepX;
    const txt = formatDate(labels[idx]);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, x - tw / 2, height - 8);
  });

  // Legend
  drawLegend(ctx, Math.max(padding.left + 6, width - padding.right - 240), 10, [
    { color: "rgba(15, 118, 110, 0.32)", text: "Выручка за день", box: true },
    { color: "#b45309", text: "Скользящее среднее (7д)", box: false },
    { color: "#475569", text: "Предыдущий период", box: false, dashed: true }
  ]);

  const points = labels.map((date, i) => {
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
    return {
      index: i,
      x,
      currentDate: date,
      currentValue: values[i] || 0,
      previousDate: ranges && isoToDate(ranges.previous.from) ? dateToIso(addDays(isoToDate(ranges.previous.from), i)) : null,
      previousValue: previousValues[i]
    };
  });
  return { width, height, padding, points };
}

function resolveChartRanges(rows, from, to) {
  const current = resolveCurrentRange(rows, from, to);
  if (!current) return null;
  const mode = els.compareMode.value || "wow";
  const currentCopy = { ...current };
  const previous = resolvePreviousRange(currentCopy, mode);
  if (!previous) return null;
  return { current: currentCopy, previous, mode };
}

function buildDateRange(fromIso, toIso) {
  const fromDate = isoToDate(fromIso);
  const toDate = isoToDate(toIso);
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const out = [];
  for (let d = new Date(fromDate); d <= toDate; d = addDays(d, 1)) {
    out.push(dateToIso(d));
  }
  return out;
}

function aggregateByDate(rows, from, to) {
  const map = new Map();
  rows.forEach((r) => {
    if (r.date === "Без даты") return;
    if (r.date < from || r.date > to) return;
    map.set(r.date, (map.get(r.date) || 0) + r.revenue);
  });
  return map;
}

function getMovingAverage(values, windowSize) {
  if (!Array.isArray(values) || !values.length) return [];
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= windowSize) sum -= values[i - windowSize];
    if (i >= windowSize - 1) out[i] = sum / windowSize;
  }
  return out;
}

function getTickIndexes(length, maxTicks) {
  if (length <= 1) return [0];
  const ticks = [0];
  const step = Math.ceil((length - 1) / Math.max(1, maxTicks - 1));
  for (let i = step; i < length - 1; i += step) ticks.push(i);
  if (ticks[ticks.length - 1] !== length - 1) ticks.push(length - 1);
  return ticks;
}

function drawDot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegend(ctx, x, y, items) {
  let curY = y;
  ctx.font = "11px Manrope";
  items.forEach((item) => {
    if (item.box) {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, curY + 2, 14, 8);
      ctx.strokeStyle = "#95a39a";
      ctx.strokeRect(x, curY + 2, 14, 8);
    } else {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      if (item.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, curY + 6);
      ctx.lineTo(x + 14, curY + 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#1d2a21";
    ctx.fillText(item.text, x + 20, curY + 10);
    curY += 16;
  });
}

function onChartPointerMove(event) {
  if (!state.chartMeta || !els.chartTooltip) return;
  const touch = event.touches && event.touches[0] ? event.touches[0] : null;
  const clientX = touch ? touch.clientX : event.clientX;
  const clientY = touch ? touch.clientY : event.clientY;
  const rect = els.chart.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const { padding, points } = state.chartMeta;
  if (!points || !points.length) {
    hideChartTooltip();
    return;
  }
  if (x < padding.left - 20 || x > rect.width - padding.right + 20 || y < padding.top - 20 || y > rect.height - padding.bottom + 20) {
    hideChartTooltip();
    return;
  }

  let nearest = points[0];
  let minDist = Math.abs(points[0].x - x);
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.abs(points[i].x - x);
    if (d < minDist) {
      minDist = d;
      nearest = points[i];
    }
  }

  const prevText = nearest.previousValue == null
    ? '<span class="muted">Пред. период: нет данных</span>'
    : `Пред. период (${formatDate(nearest.previousDate)}): <strong>${formatMoney(nearest.previousValue)}</strong>`;
  const diff = nearest.previousValue == null ? null : nearest.currentValue - nearest.previousValue;
  const diffText = diff == null ? "" : `Разница: <strong>${diff >= 0 ? "+" : ""}${formatMoney(diff)}</strong>`;

  els.chartTooltip.innerHTML = `
    <strong>${formatDate(nearest.currentDate)}</strong>
    Текущий период: <strong>${formatMoney(nearest.currentValue)}</strong><br/>
    ${prevText}<br/>
    ${diffText}
  `;

  const offset = 14;
  const tooltipW = Math.min(320, Math.max(220, els.chartTooltip.offsetWidth || 240));
  let left = nearest.x + offset;
  if (left + tooltipW > rect.width - 8) left = nearest.x - tooltipW - offset;
  if (left < 8) left = 8;
  let top = y - 20;
  if (top < 8) top = 8;

  els.chartTooltip.style.left = `${left}px`;
  els.chartTooltip.style.top = `${top}px`;
  els.chartTooltip.hidden = false;
}

function hideChartTooltip() {
  if (els.chartTooltip) els.chartTooltip.hidden = true;
}

function formatMoneyCompact(value) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} млн ₽`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)} тыс ₽`;
  return formatMoney(value);
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

window.addEventListener("resize", () => {
  const from = normalizeFilterDate(els.dateFrom.value);
  const to = normalizeFilterDate(els.dateTo.value);
  const selectedRestaurants = Array.from(els.restaurantFilter.selectedOptions || []).map((o) => o.value);
  const selectedWarehouseTypes = Array.from(els.warehouseType.selectedOptions || []).map((o) => o.value);
  const groupWarehouseCount = getGroupWarehouseCount(state.rows);
  const baseRows = state.rows.filter((row) => {
    if (selectedRestaurants.length && !selectedRestaurants.includes(row.group)) return false;
    if (!matchesWarehouseType(row, selectedWarehouseTypes, groupWarehouseCount)) return false;
    return true;
  });
  renderChart(baseRows, from, to);
});
