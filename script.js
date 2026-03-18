const state = {
  rows: [],
  filteredRows: [],
  expandedGroups: new Set(),
  showWarehouses: true,
  detailSort: "revenue_desc",
  compareOptions: [],
  chartMeta: null,
  loadedFiles: [],
  exclusionRules: [],
  showWeatherImpact: true,
  weatherByCityDate: { nn: {}, dzer: {} },
  weatherLoading: false,
  weatherError: "",
  weatherRequestSeq: 0
};

const APP_VERSION = "2026-03-18.67";
const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DEBUG_LOG_KEY = "revenue_debug_log_v1";
const EXCLUSION_RULES_KEY = "revenue_exclusion_rules_v1";
const WEATHER_IMPACT_TOGGLE_KEY = "revenue_show_weather_impact_v1";
const WEATHER_TIMEZONE = "Europe/Moscow";
const WEATHER_LOCATIONS = {
  nn: { label: "Нижний Новгород", short: "НН", latitude: 56.3269, longitude: 44.0059 },
  dzer: { label: "Дзержинск", short: "Дз", latitude: 56.2441, longitude: 43.4630 }
};
const DZER_GROUP_PATTERNS = [
  "циолковского 19а",
  "каспарус",
  "ударник",
  "ленина 64"
];
const RU_FIXED_HOLIDAYS = new Set([
  "01-01",
  "01-02",
  "01-03",
  "01-04",
  "01-05",
  "01-06",
  "01-07",
  "01-08",
  "02-23",
  "03-08",
  "05-01",
  "05-09",
  "06-12",
  "11-04"
]);
const DEFAULT_EXCLUSION_RULES = [
  "Онлайн оплата, СБП",
  "Основной склад",
  "БУРГЕР БИК ООО Чайка",
  "Бургер Бик",
  "Фабрика разделка",
  "Шале №15",
  "Совнаркомовская 13",
  "НТО ООО Приспех пр-кт Гагарина, д. 35",
  "Юность ул. Зеленский Съезд, д. 8/10",
  "ИП Амельченко Евгений Андреевич",
  "Фудтрак Амельченко пл. Маркина, д. 12А",
  "Фабрика кондитерка",
  "ул. Большая Покровская, д. 13",
  "Швейцария БИК \"ПРИСПЕХ\"",
  "Фабрика пекарня"
];

const els = {
  files: document.getElementById("files"),
  restaurantFilter: document.getElementById("restaurantFilter"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  warehouseType: document.getElementById("warehouseType"),
  compareMode: document.getElementById("compareMode"),
  comparePeriodA: document.getElementById("comparePeriodA"),
  comparePeriodB: document.getElementById("comparePeriodB"),
  comparePrevFrom: document.getElementById("comparePrevFrom"),
  comparePrevTo: document.getElementById("comparePrevTo"),
  compareCustomGroup: document.getElementById("compareCustomGroup"),
  compareStats: document.getElementById("compareStats"),
  chartGroupBy: document.getElementById("chartGroupBy"),
  chartCompareView: document.getElementById("chartCompareView"),
  enableComparison: document.getElementById("enableComparison"),
  viewWarehouses: document.getElementById("viewWarehouses"),
  detailSort: document.getElementById("detailSort"),
  detailGroupBy: document.getElementById("detailGroupBy"),
  expandAllRows: document.getElementById("expandAllRows"),
  collapseAllRows: document.getElementById("collapseAllRows"),
  exportExcel: document.getElementById("exportExcel"),
  exportPdf: document.getElementById("exportPdf"),
  exportChartPng: document.getElementById("exportChartPng"),
  downloadLog: document.getElementById("downloadLog"),
  tableBody: document.getElementById("tableBody"),
  dateTotalsBody: document.getElementById("dateTotalsBody"),
  stats: document.getElementById("stats"),
  weatherImpactSection: document.getElementById("weatherImpactSection"),
  weatherImpactStats: document.getElementById("weatherImpactStats"),
  showWeatherImpact: document.getElementById("showWeatherImpact"),
  seasonalitySection: document.getElementById("seasonalitySection"),
  seasonalityDetails: document.getElementById("seasonalityDetails"),
  seasonalityStats: document.getElementById("seasonalityStats"),
  seasonMonthBody: document.getElementById("seasonMonthBody"),
  seasonWeekdayBody: document.getElementById("seasonWeekdayBody"),
  forecastSection: document.getElementById("forecastSection"),
  forecastFrom: document.getElementById("forecastFrom"),
  forecastTo: document.getElementById("forecastTo"),
  forecastMode: document.getElementById("forecastMode"),
  buildForecast: document.getElementById("buildForecast"),
  forecastStats: document.getElementById("forecastStats"),
  forecastBody: document.getElementById("forecastBody"),
  chart: document.getElementById("chart"),
  chartTooltip: document.getElementById("chartTooltip"),
  exclusionsDetails: document.getElementById("exclusionsDetails"),
  exclusionInput: document.getElementById("exclusionInput"),
  addExclusionBtn: document.getElementById("addExclusionBtn"),
  exclusionList: document.getElementById("exclusionList"),
  exclusionSummaryCount: document.getElementById("exclusionSummaryCount")
};

let chartCtx = null;

initDebugLogging();
initExclusionRules();
initWeatherImpactToggle();

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
els.chartGroupBy.addEventListener("change", applyFilters);
els.chartCompareView.addEventListener("change", applyFilters);
els.enableComparison.addEventListener("change", () => {
  updateComparisonUI();
  applyFilters();
});
els.showWeatherImpact.addEventListener("change", () => {
  state.showWeatherImpact = Boolean(els.showWeatherImpact.checked);
  saveWeatherImpactToggle();
  updateWeatherImpactUI();
  applyFilters();
});
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
els.exportChartPng.addEventListener("click", exportChartToPng);
if (els.downloadLog) els.downloadLog.addEventListener("click", downloadDebugLog);
els.addExclusionBtn.addEventListener("click", onAddExclusionRule);
els.exclusionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onAddExclusionRule();
  }
});
els.exclusionList.addEventListener("change", onExclusionListChange);
els.exclusionList.addEventListener("click", onExclusionListClick);
els.chart.addEventListener("mousemove", onChartPointerMove);
els.chart.addEventListener("mouseleave", hideChartTooltip);
els.chart.addEventListener("touchstart", onChartPointerMove, { passive: true });
els.chart.addEventListener("touchmove", onChartPointerMove, { passive: true });
els.chart.addEventListener("touchend", hideChartTooltip);
if (els.forecastFrom) els.forecastFrom.addEventListener("change", () => renderForecast(state.filteredRows));
if (els.forecastTo) els.forecastTo.addEventListener("change", () => renderForecast(state.filteredRows));
if (els.forecastMode) els.forecastMode.addEventListener("change", () => renderForecast(state.filteredRows));
if (els.buildForecast) els.buildForecast.addEventListener("click", () => renderForecast(state.filteredRows));
toggleCompareCustom();
updateComparisonUI();
updateWarehouseActionButtons();
updateWeatherImpactUI();

function handleFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  state.loadedFiles = files;
  processFiles(files);
}

function processFiles(files) {
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
  appendDebugLog("info", "app_start", { version: APP_VERSION });
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
    appVersion: APP_VERSION,
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

function initExclusionRules() {
  const stored = readStoredExclusionRules();
  const byId = new Map(stored.map((r) => [r.id, r]));
  const defaults = DEFAULT_EXCLUSION_RULES.map((label) => {
    const id = `default:${normalizeNameKey(label)}`;
    const prev = byId.get(id);
    return {
      id,
      label,
      key: normalizeNameKey(label),
      enabled: prev ? Boolean(prev.enabled) : true,
      isDefault: true
    };
  });
  const custom = stored
    .filter((r) => !r.isDefault)
    .map((r) => ({
      id: r.id || `custom:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      label: String(r.label || "").trim(),
      key: normalizeNameKey(r.label || ""),
      enabled: Boolean(r.enabled),
      isDefault: false
    }))
    .filter((r) => r.label && r.key);
  state.exclusionRules = [...defaults, ...custom];
  saveExclusionRules();
  renderExclusionRules();
}

function readStoredExclusionRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXCLUSION_RULES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExclusionRules() {
  localStorage.setItem(EXCLUSION_RULES_KEY, JSON.stringify(state.exclusionRules));
}

function initWeatherImpactToggle() {
  try {
    const saved = localStorage.getItem(WEATHER_IMPACT_TOGGLE_KEY);
    if (saved != null) state.showWeatherImpact = saved === "1";
  } catch {
    state.showWeatherImpact = true;
  }
  if (els.showWeatherImpact) els.showWeatherImpact.checked = state.showWeatherImpact;
}

function saveWeatherImpactToggle() {
  try {
    localStorage.setItem(WEATHER_IMPACT_TOGGLE_KEY, state.showWeatherImpact ? "1" : "0");
  } catch {}
}

function updateWeatherImpactUI() {
  document.body.classList.toggle("weather-impact-off", !state.showWeatherImpact);
  if (!els.weatherImpactSection) return;
  els.weatherImpactSection.classList.toggle("hidden-soft", !state.showWeatherImpact);
}

function renderExclusionRules() {
  if (!els.exclusionList) return;
  const enabledCount = state.exclusionRules.filter((r) => r.enabled).length;
  if (els.exclusionSummaryCount) {
    els.exclusionSummaryCount.textContent = `${enabledCount} из ${state.exclusionRules.length} включено`;
  }
  if (!state.exclusionRules.length) {
    els.exclusionList.innerHTML = '<div class="empty">Исключений нет</div>';
    return;
  }
  els.exclusionList.innerHTML = state.exclusionRules
    .map(
      (r) => `
      <div class="exclusion-item">
        <input type="checkbox" data-action="toggle" data-id="${escapeHtml(r.id)}" ${r.enabled ? "checked" : ""} />
        <div>
          <div>${escapeHtml(r.label)}</div>
          <div class="exclusion-meta">${r.isDefault ? "системное" : "пользовательское"}</div>
        </div>
        ${r.isDefault ? "<span></span>" : `<button type="button" data-action="remove" data-id="${escapeHtml(r.id)}">Удалить</button>`}
      </div>
    `
    )
    .join("");
}

function onAddExclusionRule() {
  const label = String(els.exclusionInput.value || "").trim();
  const key = normalizeNameKey(label);
  if (!label || !key) return;
  const exists = state.exclusionRules.some((r) => r.key === key);
  if (exists) {
    alert("Такой объект уже есть в исключениях.");
    return;
  }
  state.exclusionRules.push({
    id: `custom:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    label,
    key,
    enabled: true,
    isDefault: false
  });
  els.exclusionInput.value = "";
  persistExclusionsAndRebuild();
}

function onExclusionListChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== "toggle") return;
  const id = target.dataset.id;
  const rule = state.exclusionRules.find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = target.checked;
  persistExclusionsAndRebuild();
}

function onExclusionListClick(event) {
  const btn = event.target.closest("button[data-action='remove']");
  if (!btn) return;
  const id = btn.dataset.id;
  state.exclusionRules = state.exclusionRules.filter((r) => r.id !== id);
  persistExclusionsAndRebuild();
}

function persistExclusionsAndRebuild() {
  saveExclusionRules();
  renderExclusionRules();
  if (state.loadedFiles.length) processFiles(state.loadedFiles);
  else applyFilters();
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
  return state.exclusionRules.some((rule) => rule.enabled && rule.key && key.includes(rule.key));
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
  updateWeatherForRows(state.filteredRows);
  renderWeatherImpact(state.filteredRows);
  renderSeasonality(state.filteredRows);
  renderForecast(state.filteredRows);
  renderDateTotals(state.filteredRows);
  renderTable(state.filteredRows);
  renderChart(baseRows, from, to);
}

function renderSeasonality(rows) {
  if (!els.seasonalitySection || !els.seasonalityStats || !els.seasonMonthBody || !els.seasonWeekdayBody) return;
  const datedRows = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")));
  if (!datedRows.length) {
    els.seasonalityStats.innerHTML = '<article class="stat"><p class="stat-title">Сезонность</p><p class="stat-value">Нет данных</p></article>';
    els.seasonMonthBody.innerHTML = '<tr><td class="empty" colspan="3">Нет данных</td></tr>';
    els.seasonWeekdayBody.innerHTML = '<tr><td class="empty" colspan="3">Нет данных</td></tr>';
    return;
  }

  const revenueByDate = new Map();
  datedRows.forEach((row) => {
    revenueByDate.set(row.date, (revenueByDate.get(row.date) || 0) + row.revenue);
  });
  const dailySeries = Array.from(revenueByDate.entries()).map(([date, revenue]) => ({ date, revenue }));
  const overallAvg = dailySeries.reduce((s, d) => s + d.revenue, 0) / Math.max(1, dailySeries.length);

  const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const monthMap = new Map();
  const weekdayMap = new Map();
  dailySeries.forEach((d) => {
    const dt = isoToDate(d.date);
    if (!dt) return;
    const m = dt.getMonth();
    const wd = (dt.getDay() + 6) % 7;
    const monthBucket = monthMap.get(m) || { month: m, total: 0, days: 0 };
    monthBucket.total += d.revenue;
    monthBucket.days += 1;
    monthMap.set(m, monthBucket);
    const weekdayBucket = weekdayMap.get(wd) || { weekday: wd, total: 0, days: 0 };
    weekdayBucket.total += d.revenue;
    weekdayBucket.days += 1;
    weekdayMap.set(wd, weekdayBucket);
  });

  const monthRows = Array.from(monthMap.values())
    .sort((a, b) => a.month - b.month)
    .map((m) => {
      const avg = m.total / Math.max(1, m.days);
      const idx = overallAvg > 0 ? (avg / overallAvg) * 100 : 0;
      return `<tr><td>${monthNames[m.month]}</td><td class="money">${formatMoney(avg)}</td><td>${Math.round(idx)}%</td></tr>`;
    })
    .join("");
  els.seasonMonthBody.innerHTML = monthRows || '<tr><td class="empty" colspan="3">Нет данных</td></tr>';

  const weekdayRows = Array.from(weekdayMap.values())
    .sort((a, b) => a.weekday - b.weekday)
    .map((w) => {
      const avg = w.total / Math.max(1, w.days);
      const idx = overallAvg > 0 ? (avg / overallAvg) * 100 : 0;
      const weekendCls = w.weekday >= 5 ? "weekend-row" : "";
      return `<tr class="${weekendCls}"><td>${WEEKDAY_NAMES[w.weekday]}</td><td class="money">${formatMoney(avg)}</td><td>${Math.round(
        idx
      )}%</td></tr>`;
    })
    .join("");
  els.seasonWeekdayBody.innerHTML = weekdayRows || '<tr><td class="empty" colspan="3">Нет данных</td></tr>';

  const bestMonth = Array.from(monthMap.values()).sort((a, b) => b.total / b.days - a.total / a.days)[0];
  const worstMonth = Array.from(monthMap.values()).sort((a, b) => a.total / a.days - b.total / b.days)[0];
  const bestWeekday = Array.from(weekdayMap.values()).sort((a, b) => b.total / b.days - a.total / a.days)[0];
  els.seasonalityStats.innerHTML = `
    <article class="stat">
      <p class="stat-title">Средняя выручка в день</p>
      <p class="stat-value">${formatMoney(overallAvg)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Сильный месяц</p>
      <p class="stat-value">${monthNames[bestMonth.month]}</p>
      <p class="stat-meta">${formatMoney(bestMonth.total / bestMonth.days)} в день</p>
    </article>
    <article class="stat">
      <p class="stat-title">Слабый месяц</p>
      <p class="stat-value">${monthNames[worstMonth.month]}</p>
      <p class="stat-meta">${formatMoney(worstMonth.total / worstMonth.days)} в день</p>
    </article>
    <article class="stat">
      <p class="stat-title">Сильный день недели</p>
      <p class="stat-value">${WEEKDAY_NAMES[bestWeekday.weekday]}</p>
      <p class="stat-meta">${formatMoney(bestWeekday.total / bestWeekday.days)} в день</p>
    </article>
  `;
}

function renderForecast(rows) {
  if (!els.forecastSection || !els.forecastStats || !els.forecastBody) return;
  const datedRows = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")));
  if (!datedRows.length) {
    els.forecastStats.innerHTML =
      '<article class="stat"><p class="stat-title">Прогноз</p><p class="stat-value">Нет данных</p><p class="stat-meta">Загрузите выручку за прошлые дни.</p></article>';
    els.forecastBody.innerHTML = '<tr><td class="empty" colspan="3">Нет данных для прогноза</td></tr>';
    return;
  }

  const dailyMap = new Map();
  datedRows.forEach((row) => {
    dailyMap.set(row.date, (dailyMap.get(row.date) || 0) + row.revenue);
  });
  const history = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const forecastMode = (els.forecastMode && els.forecastMode.value) || "base";
  const cfg = getForecastModeConfig(forecastMode);
  const profile = buildForecastProfile(history, cfg);

  const maxHistoryDate = history[history.length - 1].date;
  const defaultFrom = dateToIso(addDays(isoToDate(maxHistoryDate), 1));
  const defaultTo = dateToIso(addDays(isoToDate(maxHistoryDate), 7));
  if (els.forecastFrom && !normalizeFilterDate(els.forecastFrom.value)) els.forecastFrom.value = defaultFrom;
  if (els.forecastTo && !normalizeFilterDate(els.forecastTo.value)) els.forecastTo.value = defaultTo;

  const from = normalizeFilterDate(els.forecastFrom && els.forecastFrom.value);
  const to = normalizeFilterDate(els.forecastTo && els.forecastTo.value);
  const fromDate = isoToDate(from);
  const toDate = isoToDate(to);
  if (!fromDate || !toDate || from > to) {
    els.forecastStats.innerHTML =
      '<article class="stat"><p class="stat-title">Прогноз</p><p class="stat-value">Проверьте даты</p><p class="stat-meta">Укажите корректный диапазон прогноза.</p></article>';
    els.forecastBody.innerHTML = '<tr><td class="empty" colspan="3">Некорректный диапазон дат</td></tr>';
    return;
  }

  const forecastRows = buildForecastRows(history, fromDate, toDate, profile, cfg);

  const total = forecastRows.reduce((sum, row) => sum + row.revenue, 0);
  const avg = total / Math.max(1, forecastRows.length);
  els.forecastStats.innerHTML = `
    <article class="stat">
      <p class="stat-title">Период прогноза</p>
      <p class="stat-value">${formatDate(from)} - ${formatDate(to)}</p>
      <p class="stat-meta">${forecastRows.length} дней</p>
    </article>
    <article class="stat">
      <p class="stat-title">Прогноз: всего</p>
      <p class="stat-value">${formatMoney(total)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Прогноз: среднее в день</p>
      <p class="stat-value">${formatMoney(avg)}</p>
      <p class="stat-meta">Режим: ${cfg.label}. Модель: адаптивный уровень + день недели/месяц + лаг 7 дней.</p>
    </article>
  `;

  els.forecastBody.innerHTML = forecastRows
    .map((row) => {
      const weekendCls = row.dayType === "holiday" ? "holiday-row" : row.weekday >= 5 ? "weekend-row" : "";
      return `<tr class="${weekendCls}"><td>${formatDate(row.date)}</td><td>${WEEKDAY_NAMES[row.weekday]}</td><td class="money">${formatMoney(
        row.revenue
      )}</td></tr>`;
    })
    .join("");
}

function buildForecastProfile(historyDailyRows, cfg) {
  const baseAvg =
    historyDailyRows.reduce((sum, row) => sum + row.revenue, 0) / Math.max(1, historyDailyRows.length);
  const weekdayAgg = new Map();
  const monthAgg = new Map();
  const dayTypeAgg = new Map();

  historyDailyRows.forEach((row) => {
    const d = isoToDate(row.date);
    if (!d) return;
    const weekday = (d.getDay() + 6) % 7;
    const month = d.getMonth();
    const dayInfo = getSpecialDayInfo(row.date);
    const dayType = dayInfo.holiday ? "holiday" : dayInfo.weekend ? "weekend" : "workday";
    const w = weekdayAgg.get(weekday) || { total: 0, count: 0 };
    w.total += row.revenue;
    w.count += 1;
    weekdayAgg.set(weekday, w);
    const m = monthAgg.get(month) || { total: 0, count: 0 };
    m.total += row.revenue;
    m.count += 1;
    monthAgg.set(month, m);
    const dt = dayTypeAgg.get(dayType) || { total: 0, count: 0 };
    dt.total += row.revenue;
    dt.count += 1;
    dayTypeAgg.set(dayType, dt);
  });

  const weekdayIndex = new Map();
  weekdayAgg.forEach((v, k) => {
    const avg = v.total / Math.max(1, v.count);
    const rawIdx = baseAvg > 0 ? avg / baseAvg : 1;
    const reliability = Math.min(1, v.count / 10);
    weekdayIndex.set(k, clampNumber(1 + (rawIdx - 1) * reliability, cfg.weekdayMin, cfg.weekdayMax));
  });
  const monthIndex = new Map();
  monthAgg.forEach((v, k) => {
    const avg = v.total / Math.max(1, v.count);
    const rawIdx = baseAvg > 0 ? avg / baseAvg : 1;
    const reliability = Math.min(1, v.count / 12);
    monthIndex.set(k, clampNumber(1 + (rawIdx - 1) * reliability, cfg.monthMin, cfg.monthMax));
  });
  const dayTypeIndex = new Map([
    ["workday", 1],
    ["weekend", 1],
    ["holiday", cfg.defaultHolidayIndex]
  ]);
  dayTypeAgg.forEach((v, k) => {
    const avg = v.total / Math.max(1, v.count);
    const rawIdx = baseAvg > 0 ? avg / baseAvg : 1;
    const reliability = Math.min(1, v.count / 20);
    dayTypeIndex.set(k, clampNumber(1 + (rawIdx - 1) * reliability, cfg.dayTypeMin, cfg.dayTypeMax));
  });

  const trendIndex = calcTrendIndex(historyDailyRows, cfg);
  const historyByDate = new Map(historyDailyRows.map((row) => [row.date, row.revenue]));
  return { baseAvg, weekdayIndex, monthIndex, dayTypeIndex, trendIndex, historyByDate };
}

function buildForecastRows(historyDailyRows, fromDate, toDate, profile, cfg) {
  const synthetic = [...historyDailyRows].map((r) => ({ ...r }));
  synthetic.sort((a, b) => a.date.localeCompare(b.date));
  const forecastRows = [];

  for (let d = new Date(fromDate); d <= toDate; d = addDays(d, 1)) {
    const iso = dateToIso(d);
    const weekday = (d.getDay() + 6) % 7;
    const month = d.getMonth();
    const dayInfo = getSpecialDayInfo(iso);
    const dayType = dayInfo.holiday ? "holiday" : dayInfo.weekend ? "weekend" : "workday";

    const adaptiveLevel = calcAdaptiveLevel(synthetic, profile.baseAvg, cfg);
    const weekdayIndexStatic = profile.weekdayIndex.get(weekday) || 1;
    const weekdayIndexDyn = calcDynamicWeekdayIndex(synthetic, weekday, adaptiveLevel, cfg);
    const weekdayIndex = blendValues(weekdayIndexStatic, weekdayIndexDyn, cfg.dynamicWeekdayBlend);
    const monthIndex = profile.monthIndex.get(month) || 1;
    const dayTypeIndex = profile.dayTypeIndex.get(dayType) || 1;
    const trendIndex = profile.trendIndex || 1;
    const structuralIdx = clampNumber(weekdayIndex * monthIndex * dayTypeIndex * trendIndex, cfg.combinedMin, cfg.combinedMax);
    let predicted = adaptiveLevel * structuralIdx;

    const lag7Date = dateToIso(addDays(d, -7));
    const lag7 = getSeriesRevenueByDate(synthetic, lag7Date);
    if (lag7 != null && lag7 > 0) {
      predicted = blendValues(predicted, lag7, cfg.weekLagWeight);
    }

    const yoyDate = dateToIso(addYears(d, -1));
    const yoy = profile.historyByDate.get(yoyDate);
    if (yoy != null && yoy > 0) {
      predicted = blendValues(predicted, yoy, cfg.yoyWeight);
    }

    predicted = round2(Math.max(0, predicted));
    synthetic.push({ date: iso, revenue: predicted });
    forecastRows.push({ date: iso, weekday, dayType, revenue: predicted });
  }

  return forecastRows;
}

function calcAdaptiveLevel(series, fallbackLevel, cfg) {
  if (!series.length) return fallbackLevel;
  const slice = series.slice(-cfg.levelWindow);
  let weight = 1;
  let sumW = 0;
  let sumV = 0;
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const revenue = Number(slice[i].revenue) || 0;
    sumV += revenue * weight;
    sumW += weight;
    weight *= cfg.levelDecay;
  }
  const avg = sumW > 0 ? sumV / sumW : fallbackLevel;
  return avg > 0 ? avg : fallbackLevel;
}

function calcDynamicWeekdayIndex(series, weekday, baseLevel, cfg) {
  const slice = series.slice(-cfg.weekdayWindow);
  let weight = 1;
  let num = 0;
  let den = 0;
  let count = 0;
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const d = isoToDate(slice[i].date);
    const wd = d ? (d.getDay() + 6) % 7 : -1;
    if (wd === weekday) {
      const revenue = Number(slice[i].revenue) || 0;
      num += revenue * weight;
      den += weight;
      count += 1;
    }
    weight *= cfg.weekdayDecay;
  }
  if (den <= 0 || baseLevel <= 0) return 1;
  const sameWeekdayAvg = num / den;
  const raw = sameWeekdayAvg / baseLevel;
  const reliability = Math.min(1, count / cfg.weekdayNeed);
  return clampNumber(1 + (raw - 1) * reliability, cfg.weekdayMin, cfg.weekdayMax);
}

function getSeriesRevenueByDate(series, isoDate) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].date === isoDate) return Number(series[i].revenue) || 0;
  }
  return null;
}

function blendValues(a, b, weightB) {
  const w = clampNumber(Number(weightB) || 0, 0, 1);
  return a * (1 - w) + b * w;
}

function calcTrendIndex(historyDailyRows, cfg) {
  if (historyDailyRows.length < 14) return 1;
  const sorted = [...historyDailyRows].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-14);
  const previous = sorted.slice(-28, -14);
  if (!previous.length) return 1;
  const recentAvg = recent.reduce((s, r) => s + r.revenue, 0) / recent.length;
  const previousAvg = previous.reduce((s, r) => s + r.revenue, 0) / previous.length;
  if (previousAvg <= 0) return 1;
  const ratio = recentAvg / previousAvg;
  return clampNumber(ratio, cfg.trendMin, cfg.trendMax);
}

function getForecastModeConfig(mode) {
  if (mode === "conservative") {
    return {
      mode,
      label: "Консервативный",
      weekdayMin: 0.9,
      weekdayMax: 1.1,
      monthMin: 0.92,
      monthMax: 1.08,
      dayTypeMin: 0.9,
      dayTypeMax: 1.05,
      defaultHolidayIndex: 0.9,
      trendMin: 0.93,
      trendMax: 1.06,
      combinedMin: 0.72,
      combinedMax: 1.2,
      levelWindow: 35,
      levelDecay: 0.93,
      weekdayWindow: 70,
      weekdayDecay: 0.95,
      weekdayNeed: 8,
      dynamicWeekdayBlend: 0.35,
      weekLagWeight: 0.3,
      yoyWeight: 0.08
    };
  }
  if (mode === "aggressive") {
    return {
      mode,
      label: "Агрессивный",
      weekdayMin: 0.8,
      weekdayMax: 1.2,
      monthMin: 0.85,
      monthMax: 1.18,
      dayTypeMin: 0.8,
      dayTypeMax: 1.12,
      defaultHolidayIndex: 0.95,
      trendMin: 0.85,
      trendMax: 1.18,
      combinedMin: 0.62,
      combinedMax: 1.45,
      levelWindow: 28,
      levelDecay: 0.9,
      weekdayWindow: 84,
      weekdayDecay: 0.94,
      weekdayNeed: 6,
      dynamicWeekdayBlend: 0.55,
      weekLagWeight: 0.5,
      yoyWeight: 0.15
    };
  }
  return {
    mode: "base",
    label: "Базовый",
    weekdayMin: 0.85,
    weekdayMax: 1.15,
    monthMin: 0.88,
    monthMax: 1.12,
    dayTypeMin: 0.85,
    dayTypeMax: 1.1,
    defaultHolidayIndex: 0.95,
    trendMin: 0.9,
    trendMax: 1.1,
    combinedMin: 0.7,
    combinedMax: 1.3,
    levelWindow: 30,
    levelDecay: 0.92,
    weekdayWindow: 84,
    weekdayDecay: 0.95,
    weekdayNeed: 7,
    dynamicWeekdayBlend: 0.45,
    weekLagWeight: 0.4,
    yoyWeight: 0.12
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toggleCompareCustom() {
  if (!isComparisonEnabled()) {
    const customGroups = document.querySelectorAll(".compare-custom");
    customGroups.forEach((el) => el.classList.remove("visible"));
    const presetGroups = document.querySelectorAll(".compare-preset");
    presetGroups.forEach((el) => el.classList.remove("visible"));
    return;
  }
  const isCustom = (els.compareMode.value || "wow") === "custom";
  const customGroups = document.querySelectorAll(".compare-custom");
  customGroups.forEach((el) => el.classList.toggle("visible", isCustom));
  const presetGroups = document.querySelectorAll(".compare-preset");
  presetGroups.forEach((el) => el.classList.toggle("visible", !isCustom));
}

function updateComparisonUI() {
  const enabled = isComparisonEnabled();
  const comparisonOnlyBlocks = document.querySelectorAll(".comparison-only");
  comparisonOnlyBlocks.forEach((el) => el.classList.toggle("hidden-soft", !enabled));
  if (els.chartCompareView) els.chartCompareView.disabled = !enabled;
  updatePrintModeFlags();
  toggleCompareCustom();
}

function renderComparison(rows, from, to) {
  const currentRange = resolveCurrentRange(rows, from, to);
  if (!currentRange) {
    els.compareStats.innerHTML = `
      <article class="stat">
        <p class="stat-title">Сравнение</p>
        <p class="stat-value">Выберите период</p>
        <p class="stat-meta">Укажите даты в блоке выше.</p>
      </article>
    `;
    return;
  }
  if (!isComparisonEnabled()) {
    const currentTotalOnly = sumByRange(rows, currentRange.from, currentRange.to);
    els.compareStats.innerHTML = `
      <article class="stat stat--current">
        <p class="stat-title">Текущий период (${formatDate(currentRange.from)} - ${formatDate(currentRange.to)})</p>
        <p class="stat-value">${formatMoney(currentTotalOnly)}</p>
        <p class="stat-meta">Сравнение отключено.</p>
      </article>
    `;
    return;
  }

  const mode = els.compareMode.value || "wow";
  const previousRange = resolvePreviousRange(currentRange, mode);
  if (!previousRange) {
    els.compareStats.innerHTML = `
      <article class="stat">
        <p class="stat-title">Сравнение</p>
        <p class="stat-value">Укажите предыдущий период</p>
        <p class="stat-meta">Выберите период A/B или заполните пользовательский диапазон.</p>
      </article>
    `;
    return;
  }

  const currentTotal = sumByRange(rows, currentRange.from, currentRange.to);
  const previousTotal = sumByRange(rows, previousRange.from, previousRange.to);
  const diff = currentTotal - previousTotal;
  const pct = previousTotal === 0 ? null : (diff / previousTotal) * 100;
  const diffClass = diff >= 0 ? "stat--diff-up" : "stat--diff-down";
  const diffLabel = diff >= 0 ? "Рост" : "Снижение";

  els.compareStats.innerHTML = `
    <article class="stat stat--current">
      <p class="stat-title">Текущий период (${formatDate(currentRange.from)} - ${formatDate(currentRange.to)})</p>
      <p class="stat-value">${formatMoney(currentTotal)}</p>
    </article>
    <article class="stat stat--previous">
      <p class="stat-title">Предыдущий период (${formatDate(previousRange.from)} - ${formatDate(previousRange.to)})</p>
      <p class="stat-value">${formatMoney(previousTotal)}</p>
    </article>
    <article class="stat ${diffClass}">
      <p class="stat-title">Разница</p>
      <p class="stat-value">${diff >= 0 ? "+" : ""}${formatMoney(diff)}${pct == null ? "" : ` (${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%)`}</p>
      <p class="stat-meta">${diffLabel}</p>
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

function updateWeatherForRows(rows) {
  if (!state.showWeatherImpact) {
    state.weatherLoading = false;
    state.weatherError = "";
    return;
  }
  const dates = [...new Set(rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))))].sort(
    (a, b) => a.localeCompare(b)
  );
  if (!dates.length) {
    state.weatherLoading = false;
    state.weatherError = "";
    renderWeatherImpact(state.filteredRows);
    return;
  }
  const cities = [...new Set(rows.map((r) => resolveWeatherCityByGroup(r.group)))];
  const missingCities = cities.filter((city) => !hasWeatherCoverage(city, dates));
  if (!missingCities.length) {
    state.weatherLoading = false;
    state.weatherError = "";
    renderWeatherImpact(state.filteredRows);
    return;
  }

  state.weatherLoading = true;
  state.weatherError = "";
  const requestId = (state.weatherRequestSeq || 0) + 1;
  state.weatherRequestSeq = requestId;
  const from = dates[0];
  const to = dates[dates.length - 1];
  appendDebugLog("info", "weather_fetch_start", { cities: missingCities, from, to });

  Promise.all(missingCities.map((city) => fetchWeatherForCityRange(city, from, to)))
    .then(() => {
      if (state.weatherRequestSeq !== requestId) return;
      state.weatherLoading = false;
      state.weatherError = "";
      appendDebugLog("info", "weather_fetch_ok", { cities: missingCities, from, to });
      renderWeatherImpact(state.filteredRows);
      renderDateTotals(state.filteredRows);
    })
    .catch((error) => {
      if (state.weatherRequestSeq !== requestId) return;
      state.weatherLoading = false;
      state.weatherError = "погода недоступна";
      appendDebugLog("warn", "weather_fetch_failed", {
        message: error && error.message ? error.message : "weather_unknown_error",
        cities: missingCities,
        from,
        to
      });
      renderWeatherImpact(state.filteredRows);
      renderDateTotals(state.filteredRows);
    });
}

function renderWeatherImpact(rows) {
  if (!els.weatherImpactStats) return;
  if (!state.showWeatherImpact) {
    els.weatherImpactStats.innerHTML = "";
    return;
  }
  if (state.weatherLoading) {
    els.weatherImpactStats.innerHTML = `
      <article class="stat">
        <p class="stat-title">Влияние погоды</p>
        <p class="stat-value">Загрузка...</p>
      </article>
    `;
    return;
  }
  const series = buildWeatherRevenueSeries(rows);
  if (series.length < 3) {
    els.weatherImpactStats.innerHTML = `
      <article class="stat">
        <p class="stat-title">Влияние погоды</p>
        <p class="stat-value">Недостаточно данных</p>
        <p class="stat-meta">Нужно минимум 3 дня с погодой и выручкой.</p>
      </article>
    `;
    return;
  }
  const rev = series.map((s) => s.revenue);
  const temps = series.map((s) => s.temp);
  const prec = series.map((s) => s.precip);
  const cloud = series.map((s) => s.cloud);
  const cTemp = calcCorrelation(rev, temps);
  const cPrec = calcCorrelation(rev, prec);
  const cCloud = calcCorrelation(rev, cloud);
  const lead = [
    { title: "Температура ↔ выручка", value: cTemp },
    { title: "Осадки ↔ выручка", value: cPrec },
    { title: "Облачность ↔ выручка", value: cCloud }
  ]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

  els.weatherImpactStats.innerHTML = `
    <article class="stat">
      <p class="stat-title">Корреляция: температура</p>
      <p class="stat-value">${formatCorrelation(cTemp)}</p>
      <p class="stat-meta">${describeCorrelation(cTemp)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Корреляция: осадки</p>
      <p class="stat-value">${formatCorrelation(cPrec)}</p>
      <p class="stat-meta">${describeCorrelation(cPrec)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Корреляция: облачность</p>
      <p class="stat-value">${formatCorrelation(cCloud)}</p>
      <p class="stat-meta">${describeCorrelation(cCloud)}</p>
    </article>
    <article class="stat">
      <p class="stat-title">Самый сильный фактор</p>
      <p class="stat-value">${escapeHtml(lead.title)}</p>
      <p class="stat-meta">${describeCorrelation(lead.value)} (${formatCorrelation(lead.value)})</p>
    </article>
  `;
}

function buildWeatherRevenueSeries(rows) {
  const byDate = new Map();
  rows.forEach((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))) return;
    const city = resolveWeatherCityByGroup(row.group);
    const cityWeather = state.weatherByCityDate[city] && state.weatherByCityDate[city][row.date];
    if (!cityWeather) return;
    const bucket = byDate.get(row.date) || { revenue: 0, byCity: new Map() };
    bucket.revenue += row.revenue;
    const cityBucket = bucket.byCity.get(city) || { revenue: 0, weather: cityWeather };
    cityBucket.revenue += row.revenue;
    cityBucket.weather = cityWeather;
    bucket.byCity.set(city, cityBucket);
    byDate.set(row.date, bucket);
  });

  return Array.from(byDate.entries())
    .map(([date, bucket]) => {
      const cityEntries = Array.from(bucket.byCity.values());
      const sumRev = cityEntries.reduce((s, c) => s + c.revenue, 0);
      if (!sumRev) return null;
      const weighted = cityEntries.reduce(
        (acc, c) => {
          const w = c.revenue / sumRev;
          acc.temp += (Number(c.weather.tempDay) || 0) * w;
          acc.precip += (Number(c.weather.precip) || 0) * w;
          acc.cloud += (Number(c.weather.cloud) || 0) * w;
          return acc;
        },
        { temp: 0, precip: 0, cloud: 0 }
      );
      return { date, revenue: bucket.revenue, ...weighted };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calcCorrelation(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = xs[i] - meanX;
    const vy = ys[i] - meanY;
    cov += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (!dx || !dy) return 0;
  return cov / Math.sqrt(dx * dy);
}

function formatCorrelation(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function describeCorrelation(value) {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "прямая" : "обратная";
  if (abs < 0.1) return "Связь почти отсутствует";
  if (abs < 0.3) return `Слабая ${sign} связь`;
  if (abs < 0.5) return `Умеренная ${sign} связь`;
  return `Сильная ${sign} связь`;
}

function hasWeatherCoverage(cityCode, dates) {
  const cityData = state.weatherByCityDate[cityCode] || {};
  for (let i = 0; i < dates.length; i += 1) {
    if (!cityData[dates[i]]) return false;
  }
  return true;
}

async function fetchWeatherForCityRange(cityCode, from, to) {
  const location = WEATHER_LOCATIONS[cityCode];
  if (!location) return;

  const todayIso = dateToIso(new Date());
  const ranges = [];
  if (from <= todayIso) ranges.push({ type: "archive", from, to: to < todayIso ? to : todayIso });
  if (to > todayIso) ranges.push({ type: "forecast", from: from > todayIso ? from : addDaysIso(todayIso, 1), to });

  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    if (range.from > range.to) continue;
    const endpoint =
      range.type === "archive"
        ? "https://archive-api.open-meteo.com/v1/archive"
        : "https://api.open-meteo.com/v1/forecast";
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean",
      timezone: WEATHER_TIMEZONE,
      start_date: range.from,
      end_date: range.to
    });
    const response = await fetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`weather_http_${response.status}`);
    }
    const data = await response.json();
    const parsed = parseWeatherDailyPayload(data);
    const cityData = state.weatherByCityDate[cityCode] || {};
    Object.keys(parsed).forEach((date) => {
      cityData[date] = parsed[date];
    });
    state.weatherByCityDate[cityCode] = cityData;
  }
}

function parseWeatherDailyPayload(payload) {
  const daily = payload && payload.daily ? payload.daily : null;
  if (!daily || !Array.isArray(daily.time)) return {};
  const out = {};
  for (let i = 0; i < daily.time.length; i += 1) {
    const date = daily.time[i];
    if (!date) continue;
    const tMax = Number(daily.temperature_2m_max && daily.temperature_2m_max[i]);
    const tMin = Number(daily.temperature_2m_min && daily.temperature_2m_min[i]);
    const tempDay = Number.isFinite(tMax) ? tMax : Number.isFinite(tMin) ? tMin : 0;
    out[date] = {
      weatherCode: Number(daily.weather_code && daily.weather_code[i]) || 0,
      tempDay,
      cloud: Number(daily.cloud_cover_mean && daily.cloud_cover_mean[i]) || 0,
      precip: Number(daily.precipitation_sum && daily.precipitation_sum[i]) || 0
    };
  }
  return out;
}

function addDaysIso(iso, days) {
  const date = isoToDate(iso);
  if (!date) return iso;
  return dateToIso(addDays(date, days));
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
    const periodLabel = formatPeriodLabelWithSpecialDays(group.periodLabel, group.dates);
    const rowClass = getPeriodRowClass(group.dates);
    html.push(`
      <tr class="group-row ${rowClass}">
        <td>${periodLabel}</td>
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
          <tr class="${rowClass}">
            <td>${periodLabel}</td>
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
    const bucket =
      byPeriod.get(period.key) ||
      { label: period.label, sortDate: period.sortDate, total: 0, dates: new Set(), cities: new Set() };
    bucket.total += row.revenue;
    bucket.dates.add(row.date);
    bucket.cities.add(resolveWeatherCityByGroup(row.group));
    byPeriod.set(period.key, bucket);
  });

  const periods = Array.from(byPeriod.values()).sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  if (!periods.length) {
    els.dateTotalsBody.innerHTML = '<tr><td class="empty" colspan="3">Нет данных по датам</td></tr>';
    return;
  }

  els.dateTotalsBody.innerHTML = periods
    .map(
      (period) => `
      <tr class="${getPeriodRowClass(period.dates)}">
        <td>${formatPeriodLabelWithSpecialDays(period.label, period.dates)}</td>
        <td class="money">${formatMoney(period.total)}</td>
        <td class="weather-cell weather-col">${buildWeatherCellHtml(period)}</td>
      </tr>
    `
    )
    .join("");
}

function resolveWeatherCityByGroup(groupName) {
  const key = normalizeNameKey(groupName);
  return DZER_GROUP_PATTERNS.some((p) => key.includes(p)) ? "dzer" : "nn";
}

function buildWeatherCellHtml(period) {
  const dates = Array.from(period.dates || []).sort((a, b) => a.localeCompare(b));
  const cities = Array.from(period.cities || []);
  if (!dates.length || !cities.length) return '<span class="weather-muted">н/д</span>';
  if (state.weatherLoading) return '<span class="weather-muted">загрузка...</span>';
  if (state.weatherError) return `<span class="weather-muted">${escapeHtml(state.weatherError)}</span>`;

  const chunks = cities.map((cityCode) => {
    const cityData = state.weatherByCityDate[cityCode] || {};
    const list = dates.map((date) => cityData[date]).filter(Boolean);
    if (!list.length) return `${WEATHER_LOCATIONS[cityCode].short}: н/д`;
    return formatWeatherSummary(list, cityCode, cities.length > 1);
  });
  return chunks.join('<br/>');
}

function formatWeatherSummary(list, cityCode, includeCityLabel) {
  const avgTempDay =
    list.reduce((sum, item) => sum + (Number(item.tempDay) || 0), 0) / Math.max(1, list.length);
  const weatherCode = pickDominantWeatherCode(list);
  const emoji = getWeatherEmoji(weatherCode);
  const label = getWeatherLabel(weatherCode);
  const cityPrefix = includeCityLabel ? `${WEATHER_LOCATIONS[cityCode].short}: ` : "";
  return `<span class="weather-line" title="${escapeHtml(label)}">${emoji} ${escapeHtml(cityPrefix)}${avgTempDay.toFixed(
    1
  )}°C днем</span>`;
}

function pickDominantWeatherCode(list) {
  const weighted = new Map();
  list.forEach((item) => {
    const code = Number(item.weatherCode) || 0;
    const score = 1 + Math.max(0, Number(item.precip) || 0) + Math.max(0, Number(item.cloud) || 0) / 100;
    weighted.set(code, (weighted.get(code) || 0) + score);
  });
  let bestCode = 0;
  let bestScore = -1;
  weighted.forEach((score, code) => {
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  });
  return bestCode;
}

function getWeatherEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

function getWeatherLabel(code) {
  const labels = {
    0: "Ясно",
    1: "Преимущественно ясно",
    2: "Переменная облачность",
    3: "Пасмурно",
    45: "Туман",
    48: "Изморозь",
    51: "Слабая морось",
    53: "Морось",
    55: "Сильная морось",
    56: "Ледяная морось",
    57: "Сильная ледяная морось",
    61: "Слабый дождь",
    63: "Дождь",
    65: "Сильный дождь",
    66: "Ледяной дождь",
    67: "Сильный ледяной дождь",
    71: "Слабый снег",
    73: "Снег",
    75: "Сильный снег",
    77: "Снежные зерна",
    80: "Ливневый дождь",
    81: "Ливень",
    82: "Сильный ливень",
    85: "Снегопад",
    86: "Сильный снегопад",
    95: "Гроза",
    96: "Гроза с градом",
    99: "Сильная гроза с градом"
  };
  return labels[code] || "Погодные условия";
}

function getSpecialDayInfo(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return { weekend: false, holiday: false };
  const d = isoToDate(isoDate);
  if (!d) return { weekend: false, holiday: false };
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const mmdd = isoDate.slice(5);
  const holiday = RU_FIXED_HOLIDAYS.has(mmdd);
  return { weekend, holiday };
}

function summarizeSpecialDays(datesSet) {
  const dates = Array.from(datesSet || []);
  let weekend = 0;
  let holiday = 0;
  dates.forEach((date) => {
    const info = getSpecialDayInfo(date);
    if (info.weekend) weekend += 1;
    if (info.holiday) holiday += 1;
  });
  return { count: dates.length, weekend, holiday };
}

function getPeriodRowClass(datesSet) {
  const s = summarizeSpecialDays(datesSet);
  if (s.holiday > 0) return "holiday-row";
  if (s.weekend > 0) return "weekend-row";
  return "";
}

function formatPeriodLabelWithSpecialDays(label, datesSet) {
  const safe = escapeHtml(label);
  const s = summarizeSpecialDays(datesSet);
  if (!s.count) return safe;
  if (s.count === 1) {
    if (s.holiday) return `${safe} <span class="day-badge day-badge-holiday">Праздник</span>`;
    if (s.weekend) return `${safe} <span class="day-badge day-badge-weekend">Выходной</span>`;
    return safe;
  }
  const parts = [];
  if (s.weekend) parts.push(`Вых: ${s.weekend}`);
  if (s.holiday) parts.push(`Праздн: ${s.holiday}`);
  if (!parts.length) return safe;
  return `${safe} <span class="day-badge day-badge-mixed">${escapeHtml(parts.join(" | "))}</span>`;
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
      {
        key,
        date: period.sortDate,
        periodLabel: period.label,
        periodKey: period.key,
        group: row.group,
        total: 0,
        warehouseMap: new Map(),
        dates: new Set()
      };
    bucket.total += row.revenue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))) bucket.dates.add(row.date);
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
  if (!state.filteredRows.length) {
    alert("Нет данных для экспорта.");
    return;
  }
  const from = normalizeFilterDate(els.dateFrom.value);
  const to = normalizeFilterDate(els.dateTo.value);
  const range = resolveCurrentRange(state.filteredRows, from, to);
  const previousTitle = document.title;
  const stamp = range
    ? `${formatDateForFileName(range.from)}-${formatDateForFileName(range.to)}`
    : new Date().toISOString().slice(0, 10);
  document.title = `Выручка_ресторанов_${stamp}`;
  const restoreTitle = () => {
    document.title = previousTitle;
  };
  window.addEventListener("afterprint", restoreTitle, { once: true });
  setTimeout(restoreTitle, 1200);
  updatePrintModeFlags();
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

  const groupBy = els.chartGroupBy ? els.chartGroupBy.value || "day" : "day";
  const compareView = isComparisonEnabled()
    ? (els.chartCompareView ? els.chartCompareView.value || "overlay" : "overlay")
    : "none";
  if (els.chartCompareView) els.chartCompareView.disabled = !isComparisonEnabled();
  const ranges = resolveChartRanges(baseRows, from, to);
  if (!ranges) {
    state.chartMeta = null;
    hideChartTooltip();
    drawRevenueChart(ctx, [], [], null, groupBy, compareView);
    return;
  }

  const currentSeries = aggregateRangeByPeriod(baseRows, ranges.current.from, ranges.current.to, groupBy);
  const previousSeries = ranges.previous
    ? aggregateRangeByPeriod(baseRows, ranges.previous.from, ranges.previous.to, groupBy)
    : [];
  state.chartMeta = drawRevenueChart(ctx, currentSeries, previousSeries, ranges, groupBy, compareView);
}

function drawRevenueChart(ctx, currentSeries, previousSeries, ranges, groupBy, compareView) {
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
  const labels = currentSeries.map((p) => p.label);
  const values = currentSeries.map((p) => p.total);
  const previousValues = currentSeries.map((_, i) => (i < previousSeries.length ? previousSeries[i].total : null));
  const isIndexMode = compareView === "index_100";
  const comparisonEnabled = compareView !== "none";
  const averageWindow = groupBy === "day" ? 7 : groupBy === "week" ? 4 : 3;
  const averageLabelSuffix = groupBy === "day" ? "дн" : groupBy === "week" ? "нед" : "мес";
  const periodNoun = groupBy === "day" ? "день" : groupBy === "week" ? "неделю" : "месяц";
  const currentIndexed = isIndexMode ? toIndexSeries(values) : null;
  const previousIndexed = isIndexMode ? toIndexSeries(previousValues) : null;
  const currentPlotValues = isIndexMode ? currentIndexed : values;
  const previousPlotValues = comparisonEnabled ? (isIndexMode ? previousIndexed : previousValues) : [];

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
  const metricPool = [
    ...currentPlotValues.filter((v) => v != null),
    ...previousPlotValues.filter((v) => v != null)
  ];
  const max = metricPool.length ? Math.max(...metricPool) : 1;
  const min = metricPool.length ? Math.min(...metricPool) : 0;
  const yMax = isIndexMode ? Math.max(105, max * 1.07) : (max > 0 ? max * 1.08 : 1);
  let yMin = isIndexMode ? Math.max(0, Math.min(95, min * 0.95)) : 0;
  if (yMax - yMin < 10) yMin = Math.max(0, yMax - 10);
  const yRange = yMax - yMin;
  const stepX = labels.length === 1 ? 0 : plotW / (labels.length - 1);
  const movingAverage = getMovingAverage(values, averageWindow);

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
    const txt = isIndexMode ? formatPercent(val) : formatMoneyCompact(val);
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

  const barW = Math.max(3, Math.min(16, stepX * 0.6 || plotW * 0.5));
  if (groupBy === "day") {
    currentSeries.forEach((period, i) => {
      const info = getSpecialDayInfo(period.key);
      if (!info.weekend && !info.holiday) return;
      const xCenter = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
      const x1 = i === 0 ? padding.left : (xCenter + (labels.length === 1 ? padding.left : padding.left + (i - 1) * stepX)) / 2;
      const x2 =
        i === labels.length - 1
          ? width - padding.right
          : (xCenter + (labels.length === 1 ? width - padding.right : padding.left + (i + 1) * stepX)) / 2;
      ctx.fillStyle = info.holiday ? "rgba(185, 28, 28, 0.10)" : "rgba(37, 99, 235, 0.08)";
      ctx.fillRect(x1, padding.top, Math.max(1, x2 - x1), plotH);
    });
  }

  if (!isIndexMode && compareView === "side_by_side" && comparisonEnabled) {
    const pairW = Math.max(4, Math.min(18, barW * 0.92));
    const offset = pairW * 0.55;
    values.forEach((v, i) => {
      const xCenter = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
      const yCur = padding.top + (1 - (v - yMin) / yRange) * plotH;
      const hCur = height - padding.bottom - yCur;
      ctx.fillStyle = "rgba(15, 118, 110, 0.48)";
      ctx.fillRect(xCenter - offset, yCur, pairW, hCur);

      const pv = previousValues[i];
      if (pv != null) {
        const yPrev = padding.top + (1 - (pv - yMin) / yRange) * plotH;
        const hPrev = height - padding.bottom - yPrev;
        ctx.fillStyle = "rgba(71, 85, 105, 0.42)";
        ctx.fillRect(xCenter + 1, yPrev, pairW, hPrev);
      }
    });
  } else if (!isIndexMode) {
    ctx.fillStyle = "rgba(15, 118, 110, 0.32)";
    values.forEach((v, i) => {
      const xCenter = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
      const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
      const h = height - padding.bottom - y;
      ctx.fillRect(xCenter - barW / 2, y, barW, h);
    });
  }

  // Current line in index mode
  if (isIndexMode) {
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let startedCurIndex = false;
    currentIndexed.forEach((v, i) => {
      if (v == null) return;
      const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
      const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
      if (startedCurIndex) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        startedCurIndex = true;
      }
    });
    ctx.stroke();
  }

  // Moving average
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let startedAvgLine = false;
  movingAverage.forEach((v, i) => {
    if (v == null) return;
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
    const y = padding.top + (1 - (v - yMin) / yRange) * plotH;
    if (startedAvgLine) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      startedAvgLine = true;
    }
  });
  if (!isIndexMode) ctx.stroke();

  // Previous period line (overlay/index modes)
  const hasPreviousData = comparisonEnabled && previousPlotValues.some((v) => v != null);
  if (hasPreviousData && compareView !== "side_by_side") {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let startedPrevLine = false;
    previousPlotValues.forEach((v, i) => {
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

  // Min/Max markers (by current raw values)
  drawDot(ctx, labels.length === 1 ? padding.left + plotW / 2 : padding.left + maxIndex * stepX, padding.top + (1 - ((isIndexMode ? currentIndexed[maxIndex] : maxValue) - yMin) / yRange) * plotH, "#0f766e");
  drawDot(ctx, labels.length === 1 ? padding.left + plotW / 2 : padding.left + minIndex * stepX, padding.top + (1 - ((isIndexMode ? currentIndexed[minIndex] : minValue) - yMin) / yRange) * plotH, "#5d6a61");

  ctx.fillStyle = "#1d2a21";
  ctx.font = "11px Manrope";
  if (isIndexMode) {
    const maxIdxVal = currentIndexed[maxIndex] == null ? 0 : currentIndexed[maxIndex];
    const minIdxVal = currentIndexed[minIndex] == null ? 0 : currentIndexed[minIndex];
    ctx.fillText(`MAX: ${formatPercent(maxIdxVal)} (${currentSeries[maxIndex].label})`, padding.left, 14);
    ctx.fillText(`MIN: ${formatPercent(minIdxVal)} (${currentSeries[minIndex].label})`, padding.left, 30);
    ctx.fillText("БАЗА ИНДЕКСА: первая точка периода = 100%", padding.left, 46);
  } else {
    const maxLabel = `MAX: ${formatMoneyCompact(maxValue)} (${currentSeries[maxIndex].label})`;
    const minLabel = `MIN: ${formatMoneyCompact(minValue)} (${currentSeries[minIndex].label})`;
    ctx.fillText(maxLabel, padding.left, 14);
    ctx.fillText(minLabel, padding.left, 30);
    ctx.fillText(`СРЕДНЕЕ: ${formatMoneyCompact(avg)} | ИТОГО: ${formatMoneyCompact(total)}`, padding.left, 46);
  }

  // X labels
  const ticks = getTickIndexes(labels.length, 6);
  ctx.fillStyle = "#1d2a21";
  ctx.font = "11px Manrope";
  ticks.forEach((idx) => {
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + idx * stepX;
    const txt = formatChartXAxisLabel(currentSeries[idx], groupBy);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, x - tw / 2, height - 8);
  });

  // Legend
  const legendItems = !comparisonEnabled
    ? [
      { color: "rgba(15, 118, 110, 0.32)", text: `Выручка за ${periodNoun}`, box: true },
      { color: "#b45309", text: `Скользящее среднее (${averageWindow} ${averageLabelSuffix})`, box: false }
    ]
    : isIndexMode
    ? [
      { color: "#0f766e", text: "Текущий период (индекс)", box: false },
      { color: "#475569", text: "Предыдущий период (индекс)", box: false, dashed: true }
    ]
    : compareView === "side_by_side"
      ? [
        { color: "rgba(15, 118, 110, 0.48)", text: `Текущий период (${periodNoun})`, box: true },
        { color: "rgba(71, 85, 105, 0.42)", text: "Предыдущий период", box: true },
        { color: "#b45309", text: `Скользящее среднее (${averageWindow} ${averageLabelSuffix})`, box: false }
      ]
      : [
        { color: "rgba(15, 118, 110, 0.32)", text: `Выручка за ${periodNoun}`, box: true },
        { color: "#b45309", text: `Скользящее среднее (${averageWindow} ${averageLabelSuffix})`, box: false },
        { color: "#475569", text: "Предыдущий период", box: false, dashed: true }
      ];
  if (groupBy === "day") {
    legendItems.push({ color: "rgba(37, 99, 235, 0.25)", text: "Выходные", box: true });
    legendItems.push({ color: "rgba(185, 28, 28, 0.25)", text: "Праздники", box: true });
  }
  drawLegend(ctx, Math.max(padding.left + 6, width - padding.right - 285), 10, legendItems);

  const points = labels.map((_, i) => {
    const x = labels.length === 1 ? padding.left + plotW / 2 : padding.left + i * stepX;
    return {
      index: i,
      x,
      currentLabel: currentSeries[i].label,
      dayKey: currentSeries[i].key,
      currentValue: values[i] || 0,
      previousLabel: i < previousSeries.length ? previousSeries[i].label : null,
      previousValue: previousValues[i],
      currentIndex: currentIndexed ? currentIndexed[i] : null,
      previousIndex: previousIndexed ? previousIndexed[i] : null,
      isIndexMode
    };
  });
  return { width, height, padding, points };
}

function resolveChartRanges(rows, from, to) {
  const current = resolveCurrentRange(rows, from, to);
  if (!current) return null;
  if (!isComparisonEnabled()) return { current: { ...current }, previous: null, mode: "off" };
  const mode = els.compareMode.value || "wow";
  const currentCopy = { ...current };
  const previous = resolvePreviousRange(currentCopy, mode);
  if (!previous) return null;
  return { current: currentCopy, previous, mode };
}

function aggregateRangeByPeriod(rows, from, to, mode) {
  const map = new Map();
  rows.forEach((r) => {
    if (r.date === "Без даты") return;
    if (r.date < from || r.date > to) return;
    const period = getPeriodInfo(r.date, mode);
    const bucket = map.get(period.key) || { key: period.key, label: period.label, sortDate: period.sortDate, total: 0 };
    bucket.total += r.revenue;
    map.set(period.key, bucket);
  });
  return Array.from(map.values()).sort((a, b) => a.sortDate.localeCompare(b.sortDate));
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

function formatChartXAxisLabel(period, mode) {
  if (!period) return "";
  if (mode === "month") {
    const [m, y] = String(period.label).split(".");
    return `${m}.${String(y).slice(-2)}`;
  }
  if (mode === "week") {
    const start = String(period.label).split(" - ")[0];
    return start.slice(0, 5);
  }
  return String(period.label).slice(0, 5);
}

function toIndexSeries(values) {
  let base = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v != null && Number.isFinite(v) && v > 0) {
      base = v;
      break;
    }
  }
  if (!base) return values.map(() => null);
  return values.map((v) => (v == null ? null : (v / base) * 100));
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
    : `Пред. период (${nearest.previousLabel}): <strong>${formatMoney(nearest.previousValue)}</strong>`;
  const diff = nearest.previousValue == null ? null : nearest.currentValue - nearest.previousValue;
  const diffText = diff == null ? "" : `Разница: <strong>${diff >= 0 ? "+" : ""}${formatMoney(diff)}</strong>`;
  const dayInfo = nearest.dayKey ? getSpecialDayInfo(nearest.dayKey) : { weekend: false, holiday: false };
  const dayTypeText = dayInfo.holiday ? "Праздничный день" : dayInfo.weekend ? "Выходной день" : "";
  const idxText = nearest.isIndexMode
    ? `<br/>Индекс: <strong>${formatPercent(nearest.currentIndex)}</strong>${
      nearest.previousIndex == null ? "" : ` vs <strong>${formatPercent(nearest.previousIndex)}</strong>`
    }`
    : "";

  els.chartTooltip.innerHTML = `
    <strong>${nearest.currentLabel}</strong>
    Текущий период: <strong>${formatMoney(nearest.currentValue)}</strong><br/>
    ${prevText}<br/>
    ${diffText}
    ${dayTypeText ? `<br/>Тип дня: <strong>${dayTypeText}</strong>` : ""}
    ${idxText}
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

function isComparisonEnabled() {
  return !els.enableComparison || Boolean(els.enableComparison.checked);
}

function exportChartToPng() {
  if (!els.chart || !els.chart.width || !els.chart.height) {
    alert("График пока пуст. Загрузите данные.");
    return;
  }
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = els.chart.toDataURL("image/png");
  link.download = `график_выручки_${stamp}.png`;
  link.click();
}

function updatePrintModeFlags() {
  const rowsInRange = getRowsForCurrentDateRange(state.filteredRows || []);
  const uniqueDaysInRange = getUniqueDatedDayCount(rowsInRange);
  document.body.classList.toggle("print-hide-comparison", !isComparisonEnabled());
  const weatherSeries = buildWeatherRevenueSeries(rowsInRange);
  const hideWeatherForPrint =
    !state.showWeatherImpact || state.weatherLoading || uniqueDaysInRange < 3 || weatherSeries.length < 3;
  document.body.classList.toggle("print-hide-weather-impact", hideWeatherForPrint);
  document.body.classList.toggle("print-hide-seasonality", uniqueDaysInRange < 2);
}

function getRowsForCurrentDateRange(rows) {
  const from = normalizeFilterDate(els.dateFrom && els.dateFrom.value);
  const to = normalizeFilterDate(els.dateTo && els.dateTo.value);
  return (rows || []).filter((row) => {
    if (!row || !row.date || row.date === "Без даты") return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    return true;
  });
}

function getUniqueDatedDayCount(rows) {
  return new Set((rows || []).map((r) => r.date).filter((d) => d && d !== "Без даты")).size;
}

function formatMoneyCompact(value) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} млн ₽`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)} тыс ₽`;
  return formatMoney(value);
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return "н/д";
  return `${value.toFixed(1)}%`;
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

function formatDateForFileName(isoDate) {
  if (!isoDate || isoDate === "Без даты") return "bez-daty";
  return String(isoDate).replace(/[^\d-]/g, "");
}

window.addEventListener("beforeprint", updatePrintModeFlags);
window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-hide-comparison");
  document.body.classList.remove("print-hide-weather-impact");
  document.body.classList.remove("print-hide-seasonality");
});

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
