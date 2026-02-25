import {
  computeDerivedSeries,
  computeWellFeatures,
  computeMultiChannelFeatures,
  rankFeaturesByComparison,
  computeDetectionScore,
  computeZStats,
  metricValue
} from "./analysis.js";
import {
  renderSeriesChart,
  renderFeatureChart,
  renderPlateHeatmap
} from "./charts.js";
import { parseVictorXlsx } from "./xlsx-parser.js";

const CONTROL_GROUP = "Control";
const DEFAULT_METRIC_LABELS = {
  od600: "OD600",
  luminescence: "Luminescence (RLU)",
  ratio: "RLU/OD600"
};

let METRIC_LABELS = { ...DEFAULT_METRIC_LABELS };

const GROUP_COLOR_PALETTE = ["#4fc3b8", "#4d9fd1", "#f3cf73", "#ef8f8f", "#b2a3ff", "#8be48d"];

const dom = {
  metricButtons: Array.from(document.querySelectorAll("[data-metric]")),
  metricToggle: document.getElementById("metric-toggle"),
  metricToggleExtra: document.getElementById("metric-toggle-extra"),
  channelCard: document.getElementById("channel-card"),
  channelControls: document.getElementById("channel-controls"),
  groupControls: document.getElementById("group-controls"),
  targetSelect: document.getElementById("target-group"),
  timeSlider: document.getElementById("time-slider"),
  timeValue: document.getElementById("time-value"),
  seriesChart: document.getElementById("series-chart"),
  featureChart: document.getElementById("feature-chart"),
  heatmapChart: document.getElementById("heatmap-chart"),
  leadForm: document.getElementById("supabase-lead-form"),
  leadFormStatus: document.getElementById("lead-form-status")
};

const app = {
  data: null,
  featureRows: [],
  groups: [],
  colorByGroup: new Map(),
  channels: null,         // null = legacy (od600/lum/ratio only)
  availableMetrics: [],   // all metric keys available in the dataset
  state: {
    metric: "od600",
    visibleGroups: new Set(),
    targetGroup: null,
    timeIndex: 0,
    activeChannels: new Set()  // channels selected for multivariate analysis
  }
};

function setMetricButtonState(metric) {
  // Re-query in case extra buttons were added
  const allButtons = document.querySelectorAll("[data-metric]");
  for (const button of allButtons) {
    const isActive = button.dataset.metric === metric;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  }
}

function rowIndexFromWell(well) {
  if (!well || typeof well !== "string") {
    return 0;
  }
  const rowChar = well[0].toUpperCase();
  return Math.max(0, Math.min(7, rowChar.charCodeAt(0) - 65));
}

function colIndexFromWell(well) {
  if (!well || typeof well !== "string") {
    return 0;
  }
  const col = Number.parseInt(well.slice(1), 10);
  if (!Number.isFinite(col)) {
    return 0;
  }
  return Math.max(0, Math.min(11, col - 1));
}

function renderGroupControls() {
  dom.groupControls.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const group of app.groups) {
    const id = `group-${group.toLowerCase().replace(/\s+/g, "-")}`;

    const label = document.createElement("label");
    label.className = "group-option";
    label.setAttribute("for", id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.value = group;
    checkbox.checked = app.state.visibleGroups.has(group);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        app.state.visibleGroups.add(group);
      } else {
        app.state.visibleGroups.delete(group);
      }
      syncTargetOptions();
      renderAll();
    });

    const swatch = document.createElement("span");
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.width = "8px";
    swatch.style.height = "8px";
    swatch.style.borderRadius = "999px";
    swatch.style.display = "inline-block";
    swatch.style.background = app.colorByGroup.get(group) || "#aac0c9";

    const text = document.createElement("span");
    text.textContent = group;

    label.append(checkbox, swatch, text);
    fragment.appendChild(label);
  }
  dom.groupControls.appendChild(fragment);
}

function renderChannelControls() {
  if (!dom.channelControls || !app.channels) {
    if (dom.channelCard) dom.channelCard.hidden = true;
    return;
  }

  dom.channelCard.hidden = false;
  dom.channelControls.replaceChildren();
  const fragment = document.createDocumentFragment();

  // Get channel keys excluding "ratio" (it's virtual)
  const channelKeys = Object.keys(app.channels).filter((k) => k !== "ratio");

  for (const key of channelKeys) {
    const info = app.channels[key];
    const id = `channel-${key}`;

    const label = document.createElement("label");
    label.className = "group-option";
    label.setAttribute("for", id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.value = key;
    checkbox.checked = app.state.activeChannels.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        app.state.activeChannels.add(key);
      } else {
        app.state.activeChannels.delete(key);
      }
      recomputeFeatures();
      renderAll();
    });

    const text = document.createElement("span");
    text.textContent = info.label || key;
    text.style.fontSize = "var(--fs-xs)";

    label.append(checkbox, text);
    fragment.appendChild(label);
  }

  dom.channelControls.appendChild(fragment);
}

function renderMetricToggle() {
  if (!app.channels || !dom.metricToggleExtra) {
    dom.metricToggleExtra.hidden = true;
    return;
  }

  // Find extra channels beyond the base 3
  const extraKeys = app.availableMetrics.filter(
    (k) => !["od600", "luminescence", "ratio"].includes(k)
  );

  if (!extraKeys.length) {
    dom.metricToggleExtra.hidden = true;
    return;
  }

  dom.metricToggleExtra.hidden = false;
  dom.metricToggleExtra.replaceChildren();

  for (const key of extraKeys) {
    const label = METRIC_LABELS[key] || key;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "segment";
    btn.dataset.metric = key;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      app.state.metric = key;
      renderAll();
    });
    dom.metricToggleExtra.appendChild(btn);
  }

  // Update dom.metricButtons to include the new ones
  dom.metricButtons = Array.from(document.querySelectorAll("[data-metric]"));
}

function recomputeFeatures() {
  if (!app.data) return;

  const activeChannels = Array.from(app.state.activeChannels);
  if (activeChannels.length > 1 && app.channels) {
    // Multi-channel mode: compute features across all selected channels
    app.featureRows = app.data.wells.map(
      (well) => computeMultiChannelFeatures(well, app.data.time, activeChannels)
    );
  } else {
    // Legacy single-channel mode
    app.featureRows = app.data.wells.map(
      (well) => computeWellFeatures(well, app.data.time)
    );
  }
}

function syncTargetOptions() {
  const visibleTargets = app.groups.filter(
    (group) => group !== CONTROL_GROUP && app.state.visibleGroups.has(group)
  );

  dom.targetSelect.replaceChildren();

  if (!visibleTargets.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No target available";
    dom.targetSelect.appendChild(option);
    dom.targetSelect.disabled = true;
    app.state.targetGroup = null;
    return;
  }

  dom.targetSelect.disabled = false;
  for (const group of visibleTargets) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    dom.targetSelect.appendChild(option);
  }

  if (!visibleTargets.includes(app.state.targetGroup)) {
    app.state.targetGroup = visibleTargets[0];
  }
  dom.targetSelect.value = app.state.targetGroup;
}

function updateTimeLabel() {
  const rawSeconds = app.data?.time?.[app.state.timeIndex] ?? 0;
  const hours = rawSeconds / 3600;
  dom.timeValue.textContent = `${hours.toFixed(2)} h`;
}

function buildHeatmapModel() {
  const activeWells = app.data.wells.filter((well) => app.state.visibleGroups.has(well.group));
  const zStats = computeZStats(activeWells, app.state.metric, app.state.timeIndex);

  const cells = app.data.wells.map((well) => {
    const active = app.state.visibleGroups.has(well.group);
    const score = active
      ? computeDetectionScore(well, app.state.metric, app.state.timeIndex, zStats)
      : NaN;
    return {
      well: well.well,
      group: well.group,
      row: rowIndexFromWell(well.well),
      col: colIndexFromWell(well.well),
      active,
      value: metricValue(well, app.state.metric, app.state.timeIndex),
      score
    };
  });

  const timeLabel = `${((app.data.time[app.state.timeIndex] || 0) / 3600).toFixed(2)} h`;
  return {
    cells,
    metricLabel: METRIC_LABELS[app.state.metric] || app.state.metric,
    timeLabel
  };
}

function buildSeriesModel() {
  const visibleWells = app.data.wells.filter((well) => app.state.visibleGroups.has(well.group));
  return {
    timeHours: app.data.time.map((seconds) => seconds / 3600),
    data: computeDerivedSeries(visibleWells, app.state.metric),
    colorByGroup: app.colorByGroup,
    metricLabel: METRIC_LABELS[app.state.metric] || app.state.metric
  };
}

function buildRanking() {
  if (!app.state.targetGroup) {
    return [];
  }
  if (!app.state.visibleGroups.has(CONTROL_GROUP) || !app.state.visibleGroups.has(app.state.targetGroup)) {
    return [];
  }

  const visibleFeatureRows = app.featureRows.filter((row) => app.state.visibleGroups.has(row.group));
  return rankFeaturesByComparison(visibleFeatureRows, CONTROL_GROUP, app.state.targetGroup);
}

function renderAll() {
  if (!app.data) {
    return;
  }
  updateTimeLabel();
  setMetricButtonState(app.state.metric);

  const seriesModel = buildSeriesModel();
  const ranking = buildRanking();
  const heatmapModel = buildHeatmapModel();
  const hiddenGroupsCount = app.groups.filter((group) => !app.state.visibleGroups.has(group)).length;

  try {
    renderSeriesChart(dom.seriesChart, seriesModel, { focusGroup: app.state.targetGroup });
  } catch (error) {
    dom.seriesChart.innerHTML = `<p class="empty-state">Series chart error: ${error.message}</p>`;
  }

  try {
    renderFeatureChart(dom.featureChart, ranking, { targetGroup: app.state.targetGroup });
  } catch (error) {
    dom.featureChart.innerHTML = `<p class="empty-state">Feature chart error: ${error.message}</p>`;
  }

  try {
    renderPlateHeatmap(dom.heatmapChart, heatmapModel, { hiddenGroupsCount });
  } catch (error) {
    dom.heatmapChart.innerHTML = `<p class="empty-state">Heatmap error: ${error.message}</p>`;
  }
}

function exposeDebugSnapshot() {
  const anchorWell = app.data.wells.find((well) => well.group === CONTROL_GROUP) || app.data.wells[0];
  const anchorFeatures = computeWellFeatures(anchorWell, app.data.time);
  const ranking = rankFeaturesByComparison(app.featureRows, CONTROL_GROUP, app.state.targetGroup || app.groups[1] || CONTROL_GROUP);

  const snapshot = {
    baseline_mean: anchorFeatures.baseline_mean,
    early_slope: anchorFeatures.early_slope,
    time_to_1p2x: anchorFeatures.time_to_1p2x,
    top_features: ranking.slice(0, 5).map((entry) => entry.feature)
  };

  globalThis.__illucidateTest = {
    snapshot,
    assert() {
      const fresh = computeWellFeatures(anchorWell, app.data.time);
      const ok =
        Math.abs(fresh.baseline_mean - snapshot.baseline_mean) < 1e-12 &&
        Math.abs(fresh.early_slope - snapshot.early_slope) < 1e-12 &&
        fresh.time_to_1p2x === snapshot.time_to_1p2x;
      return {
        pass: ok,
        snapshot,
        fresh: {
          baseline_mean: fresh.baseline_mean,
          early_slope: fresh.early_slope,
          time_to_1p2x: fresh.time_to_1p2x
        }
      };
    }
  };
}

function bindLeadForm() {
  if (!dom.leadForm) {
    return;
  }

  const submitButton = dom.leadForm.querySelector('button[type="submit"]');

  dom.leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(dom.leadForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const organization = String(formData.get("organization") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!name || !email || !message) {
      setLeadFormStatus("Please complete name, email, and message before submitting.", true);
      return;
    }

    submitButton.disabled = true;
    setLeadFormStatus("Sending message...");

    try {
      await submitLead({
        name,
        email,
        organization: organization || null,
        message
      });
      dom.leadForm.reset();
      setLeadFormStatus("Thanks! Your message has been saved.");
    } catch (error) {
      setLeadFormStatus(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindEvents() {
  for (const button of dom.metricButtons) {
    button.addEventListener("click", () => {
      app.state.metric = button.dataset.metric;
      renderAll();
    });
  }

  // Delegate clicks on the extra metric toggle (buttons added dynamically)
  if (dom.metricToggleExtra) {
    dom.metricToggleExtra.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-metric]");
      if (!btn) return;
      app.state.metric = btn.dataset.metric;
      renderAll();
    });
  }

  dom.targetSelect.addEventListener("change", () => {
    app.state.targetGroup = dom.targetSelect.value || null;
    renderAll();
  });

  dom.timeSlider.addEventListener("input", () => {
    app.state.timeIndex = Number.parseInt(dom.timeSlider.value, 10) || 0;
    renderAll();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(renderAll, 140);
  });
}

function getSupabaseConfig() {
  const config = globalThis.__ILLUCIDATE_CONFIG || {};
  return {
    url: typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "",
    anonKey: typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "",
    table: typeof config.leadsTable === "string" && config.leadsTable.trim() ? config.leadsTable.trim() : "contact_leads"
  };
}

async function submitLead(payload) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase is not configured yet. Update scripts/config.js first.");
  }

  const endpoint = `${config.url}/rest/v1/${encodeURIComponent(config.table)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${details || "Unknown error"}`);
  }
}

function setLeadFormStatus(message, isError = false) {
  if (!dom.leadFormStatus) {
    return;
  }
  dom.leadFormStatus.textContent = message;
  dom.leadFormStatus.style.color = isError ? "var(--danger-300)" : "var(--teal-300)";
}

function validateDatasetSchema(dataset) {
  if (!dataset || !Array.isArray(dataset.time) || !Array.isArray(dataset.wells)) {
    throw new Error("Invalid dataset schema: expected { time: number[], wells: [] }");
  }
  if (!dataset.wells.length) {
    throw new Error("Dataset contains no wells.");
  }
}

function consumePendingCustomPlateMap() {
  const storageKey = "illucidate_custom_plate";
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem(storageKey);

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!Array.isArray(parsed.groups)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function applyCustomPlateGrouping(dataset, customPlateMap) {
  if (!dataset?.wells || !Array.isArray(customPlateMap?.groups)) {
    return false;
  }

  const groupByWell = new Map();
  for (const group of customPlateMap.groups) {
    const name = typeof group?.name === "string" && group.name.trim()
      ? group.name.trim()
      : null;
    const wells = Array.isArray(group?.wells) ? group.wells : [];
    if (!name || !wells.length) {
      continue;
    }
    for (const well of wells) {
      const key = String(well || "").trim().toUpperCase();
      if (key) {
        groupByWell.set(key, name);
      }
    }
  }

  if (!groupByWell.size) {
    return false;
  }

  for (const well of dataset.wells) {
    const key = String(well?.well || "").trim().toUpperCase();
    if (groupByWell.has(key)) {
      well.group = groupByWell.get(key);
    } else {
      well.group = "Unassigned";
    }
  }

  if (!dataset.meta || typeof dataset.meta !== "object") {
    dataset.meta = {};
  }
  dataset.meta.groups = Array.from(new Set(dataset.wells.map((well) => well.group)));
  return true;
}

function initializeDashboard(dataset) {
  validateDatasetSchema(dataset);

  const pendingCustomPlateMap = consumePendingCustomPlateMap();
  if (pendingCustomPlateMap) {
    applyCustomPlateGrouping(dataset, pendingCustomPlateMap);
  }

  app.data = dataset;
  app.groups = dataset.meta?.groups || Array.from(new Set(dataset.wells.map((well) => well.group)));
  app.colorByGroup.clear();
  app.groups.forEach((group, index) => app.colorByGroup.set(group, GROUP_COLOR_PALETTE[index % GROUP_COLOR_PALETTE.length]));
  app.state.visibleGroups = new Set(app.groups);
  app.state.targetGroup = app.groups.find((group) => group !== CONTROL_GROUP) || null;
  app.state.timeIndex = Math.min(6, Math.max(dataset.time.length - 1, 0));

  // Handle multi-channel datasets
  if (dataset.channels && typeof dataset.channels === "object") {
    app.channels = dataset.channels;
    // Build metric labels from channel metadata
    METRIC_LABELS = { ...DEFAULT_METRIC_LABELS };
    for (const [key, info] of Object.entries(dataset.channels)) {
      if (!METRIC_LABELS[key]) {
        METRIC_LABELS[key] = info.label || key;
      }
    }
    // Available metrics = channels from data
    app.availableMetrics = dataset.meta?.channels || Object.keys(dataset.channels);
    // Default active channels: all non-ratio channels
    app.state.activeChannels = new Set(
      app.availableMetrics.filter((k) => k !== "ratio")
    );
    // Default metric to first available
    if (!app.availableMetrics.includes(app.state.metric)) {
      app.state.metric = app.availableMetrics.includes("od600")
        ? "od600"
        : app.availableMetrics[0];
    }
  } else {
    app.channels = null;
    METRIC_LABELS = { ...DEFAULT_METRIC_LABELS };
    app.availableMetrics = ["od600", "luminescence", "ratio"];
    app.state.activeChannels = new Set(["od600", "luminescence"]);
    app.state.metric = "od600";
  }

  recomputeFeatures();
  renderGroupControls();
  renderChannelControls();
  renderMetricToggle();
  syncTargetOptions();
  dom.timeSlider.max = String(Math.max(dataset.time.length - 1, 0));
  dom.timeSlider.value = String(app.state.timeIndex);
  exposeDebugSnapshot();
  renderAll();
}

function showActiveBanner(label) {
  let banner = document.getElementById("active-experiment-banner");
  if (!banner) {
    return;
  }
  banner.hidden = false;
  const nameEl = banner.querySelector(".active-banner-name");
  if (nameEl) {
    nameEl.textContent = label;
  }
}

function hideActiveBanner() {
  const banner = document.getElementById("active-experiment-banner");
  if (banner) {
    banner.hidden = true;
  }
}

async function loadDemoDataset() {
  const response = await fetch("data/demo-dataset.json");
  if (!response.ok) {
    throw new Error(`Failed to load demo data (${response.status})`);
  }
  return response.json();
}

function bindFileUpload() {
  const fileBtn = document.getElementById("load-file-btn");
  const fileInput = document.getElementById("file-upload-input");
  if (!fileBtn || !fileInput) {
    return;
  }

  fileBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) {
      return;
    }
  });
}

    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        let dataset;
        if (isXlsx) {
          dataset = parseVictorXlsx(reader.result);
        } else {
          dataset = JSON.parse(reader.result);
        }
        initializeDashboard(dataset);
        showActiveBanner(file.name);
      } catch (error) {
        const message = `File load error: ${error.message}`;
        dom.seriesChart.innerHTML = `<p class="empty-state">${message}</p>`;
        console.error(error);
      }
    };

    if (isXlsx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    fileInput.value = "";
  });
}

function bindResetButton() {
  const resetBtn = document.getElementById("reset-demo-btn");
  if (!resetBtn) {
    return;
  }
  resetBtn.addEventListener("click", async () => {
    try {
      const dataset = await loadDemoDataset();
      initializeDashboard(dataset);
      hideActiveBanner();
    } catch (error) {
      console.error("Reset failed:", error);
    }
  });
}

async function bootstrap() {
  try {
    const dataset = await loadDemoDataset();
    initializeDashboard(dataset);
    bindEvents();
    bindLeadForm();
    bindFileUpload();
    bindResetButton();

    try {
      const { initBrowser } = await import("./experiment-browser.js");
      initBrowser({
        onLoad(dataset, title) {
          initializeDashboard(dataset);
          showActiveBanner(title);
        },
        containerEl: document.getElementById("experiment-drawer"),
        backdropEl: document.getElementById("drawer-backdrop"),
        triggerEl: document.getElementById("explore-data-btn")
      });
    } catch (browserError) {
      console.warn("Experiment browser module not loaded:", browserError.message);
    }

    try {
      const { initBrowser } = await import("./experiment-browser.js");
      initBrowser({
        onLoad(dataset, title) {
          initializeDashboard(dataset);
          showActiveBanner(title);
        },
        containerEl: document.getElementById("experiment-drawer"),
        backdropEl: document.getElementById("drawer-backdrop"),
        triggerEl: document.getElementById("explore-data-btn")
      });
    } catch (browserError) {
            console.warn("Experiment browser module not loaded:", browserError.message);
      const exploreBtn = document.getElementById("explore-data-btn");
      if (exploreBtn) {
        exploreBtn.disabled = true;
        exploreBtn.setAttribute("aria-disabled", "true");
        exploreBtn.classList.add("is-disabled");
        exploreBtn.title = "Explore Data is currently unavailable.";
      }
    requestAnimationFrame(() => {
      document.body.classList.add("is-ready");
    });
  } catch (error) {
    const message = `Unable to initialize dashboard: ${error.message}`;
    dom.seriesChart.innerHTML = `<p class="empty-state">${message}</p>`;
    dom.featureChart.innerHTML = `<p class="empty-state">${message}</p>`;
    dom.heatmapChart.innerHTML = `<p class="empty-state">${message}</p>`;
    document.body.classList.add("is-ready");
    console.error(error);
  }
}

bootstrap();
