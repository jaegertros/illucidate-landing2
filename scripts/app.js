import {
  computeDerivedSeries,
  computeWellFeatures,
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

const CONTROL_GROUP = "Control";
const METRIC_LABELS = {
  od600: "OD600",
  luminescence: "Luminescence (RLU)",
  ratio: "RLU/OD600"
};

const GROUP_COLOR_PALETTE = ["#4fc3b8", "#4d9fd1", "#f3cf73", "#ef8f8f", "#b2a3ff", "#8be48d"];
const PLATE_LAYOUTS = {
  6: { rows: 2, cols: 3 },
  12: { rows: 3, cols: 4 },
  24: { rows: 4, cols: 6 },
  48: { rows: 6, cols: 8 },
  96: { rows: 8, cols: 12 },
  384: { rows: 16, cols: 24 }
};
const ADDITIVE_COLORS = ["#4fc3b8", "#4d9fd1", "#f3cf73", "#ef8f8f", "#b2a3ff", "#8be48d", "#f7a6ff", "#87d9ff"];
const LAYOUT_STORAGE_KEY = "illucidate_plate_layout_v1";

const dom = {
  metricButtons: Array.from(document.querySelectorAll("[data-metric]")),
  groupControls: document.getElementById("group-controls"),
  targetSelect: document.getElementById("target-group"),
  timeSlider: document.getElementById("time-slider"),
  timeValue: document.getElementById("time-value"),
  seriesChart: document.getElementById("series-chart"),
  featureChart: document.getElementById("feature-chart"),
  heatmapChart: document.getElementById("heatmap-chart"),
  plateSizeSelect: document.getElementById("plate-size-select"),
  clearSelection: document.getElementById("clear-selection"),
  selectionHint: document.getElementById("selection-hint"),
  interactivePlate: document.getElementById("interactive-plate"),
  addAdditive: document.getElementById("add-additive"),
  additivesList: document.getElementById("additives-list"),
  plateExport: document.getElementById("plate-export"),
  downloadLayout: document.getElementById("download-layout"),
  useLayoutLink: document.getElementById("use-layout"),
  savedLayoutStatus: document.getElementById("saved-layout-status"),
  leadForm: document.getElementById("supabase-lead-form"),
  leadFormStatus: document.getElementById("lead-form-status")
};

const isDesignerPage = Boolean(dom.interactivePlate);
const isDashboardPage = Boolean(dom.seriesChart && dom.featureChart && dom.heatmapChart);

const app = {
  data: null,
  featureRows: [],
  groups: [],
  colorByGroup: new Map(),
  state: {
    metric: "od600",
    visibleGroups: new Set(),
    targetGroup: null,
    timeIndex: 0
  },
  plateDesigner: {
    plateSize: 96,
    selectedWells: new Set(),
    anchorWell: null,
    additives: []
  }
};

let additiveIdCounter = 1;

function setMetricButtonState(metric) {
  for (const button of dom.metricButtons) {
    const isActive = button.dataset.metric === metric;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  }
}

function wellName(row, col) {
  const rowLabel = String.fromCharCode(65 + row);
  return `${rowLabel}${col + 1}`;
}

function getPlateLayout() {
  return PLATE_LAYOUTS[app.plateDesigner.plateSize] || PLATE_LAYOUTS[96];
}

function getSelectionLabel() {
  const count = app.plateDesigner.selectedWells.size;
  if (!count) {
    return "Tip: click a well to select. Ctrl/Cmd-click adds or removes. Shift-click selects a row/column range from the last anchor.";
  }
  return `${count} well${count === 1 ? "" : "s"} selected.`;
}

function createAdditive() {
  const id = additiveIdCounter++;
  const color = ADDITIVE_COLORS[(id - 1) % ADDITIVE_COLORS.length];
  return {
    id,
    name: `Additive ${id}`,
    volumeUl: "",
    notes: "",
    color,
    wells: new Set()
  };
}

function resetPlateDesignerForSize() {
  app.plateDesigner.selectedWells = new Set();
  app.plateDesigner.anchorWell = null;
  for (const additive of app.plateDesigner.additives) {
    additive.wells = new Set();
  }
  renderPlateDesigner();
}

function applySelectionToAdditive(additiveId) {
  const additive = app.plateDesigner.additives.find((item) => item.id === additiveId);
  if (!additive || !app.plateDesigner.selectedWells.size) {
    return;
  }
  additive.wells = new Set([...additive.wells, ...app.plateDesigner.selectedWells]);
  renderPlateDesigner();
}

function removeAdditive(additiveId) {
  app.plateDesigner.additives = app.plateDesigner.additives.filter((item) => item.id !== additiveId);
  renderPlateDesigner();
}

function clearSelection() {
  app.plateDesigner.selectedWells = new Set();
  app.plateDesigner.anchorWell = null;
  renderPlateDesigner();
}

function serializePlateLayout() {
  return {
    plate_size: app.plateDesigner.plateSize,
    additives: app.plateDesigner.additives.map((additive) => ({
      name: additive.name,
      volume_uL: additive.volumeUl ? Number(additive.volumeUl) : null,
      notes: additive.notes || null,
      color: additive.color,
      wells: [...additive.wells].sort()
    }))
  };
}

function persistCurrentLayout() {
  const payload = serializePlateLayout();
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

function applyPersistedLayout(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const plateSize = Number.parseInt(String(payload.plate_size), 10);
  if (PLATE_LAYOUTS[plateSize]) {
    app.plateDesigner.plateSize = plateSize;
    if (dom.plateSizeSelect) {
      dom.plateSizeSelect.value = String(plateSize);
    }
  }

  const mappedAdditives = Array.isArray(payload.additives)
    ? payload.additives.map((additive, index) => ({
        id: additiveIdCounter + index,
        name: additive?.name || `Additive ${index + 1}`,
        volumeUl: additive?.volume_uL == null ? "" : String(additive.volume_uL),
        notes: additive?.notes || "",
        color: additive?.color || ADDITIVE_COLORS[index % ADDITIVE_COLORS.length],
        wells: new Set(Array.isArray(additive?.wells) ? additive.wells : [])
      }))
    : [];

  additiveIdCounter += mappedAdditives.length;
  app.plateDesigner.additives = mappedAdditives.length ? mappedAdditives : [createAdditive()];
  app.plateDesigner.selectedWells = new Set();
  app.plateDesigner.anchorWell = null;
}

function loadPersistedLayout() {
  const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function updateExportPreview() {
  if (!dom.plateExport) {
    return;
  }
  const payload = serializePlateLayout();
  dom.plateExport.textContent = JSON.stringify(payload, null, 2);
}

function getWellColor(well) {
  for (const additive of app.plateDesigner.additives) {
    if (additive.wells.has(well)) {
      return additive.color;
    }
  }
  return null;
}

function handleWellSelection(event, well, row, col) {
  const next = new Set(app.plateDesigner.selectedWells);
  const anchor = app.plateDesigner.anchorWell;
  const useRange = event.shiftKey && anchor;
  const additiveMode = event.ctrlKey || event.metaKey || useRange;

  if (!additiveMode) {
    next.clear();
  }

  if (useRange) {
    if (anchor.row === row) {
      const start = Math.min(anchor.col, col);
      const end = Math.max(anchor.col, col);
      for (let cursor = start; cursor <= end; cursor += 1) {
        next.add(wellName(row, cursor));
      }
    } else if (anchor.col === col) {
      const start = Math.min(anchor.row, row);
      const end = Math.max(anchor.row, row);
      for (let cursor = start; cursor <= end; cursor += 1) {
        next.add(wellName(cursor, col));
      }
    } else {
      next.add(well);
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (next.has(well)) {
      next.delete(well);
    } else {
      next.add(well);
    }
  } else {
    next.add(well);
  }

  app.plateDesigner.selectedWells = next;
  app.plateDesigner.anchorWell = { well, row, col };
  renderPlateDesigner();
}

function renderInteractivePlate() {
  if (!dom.interactivePlate) {
    return;
  }

  const { rows, cols } = getPlateLayout();
  dom.interactivePlate.replaceChildren();
  dom.interactivePlate.style.setProperty("--plate-cols", String(cols));

  const headerCorner = document.createElement("div");
  headerCorner.className = "plate-axis plate-axis-corner";
  headerCorner.textContent = "";
  dom.interactivePlate.appendChild(headerCorner);

  for (let col = 0; col < cols; col += 1) {
    const axis = document.createElement("div");
    axis.className = "plate-axis";
    axis.textContent = String(col + 1);
    dom.interactivePlate.appendChild(axis);
  }

  for (let row = 0; row < rows; row += 1) {
    const rowAxis = document.createElement("div");
    rowAxis.className = "plate-axis";
    rowAxis.textContent = String.fromCharCode(65 + row);
    dom.interactivePlate.appendChild(rowAxis);

    for (let col = 0; col < cols; col += 1) {
      const well = wellName(row, col);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plate-cell";
      button.textContent = well;
      button.setAttribute("role", "gridcell");

      const mappedColor = getWellColor(well);
      if (mappedColor) {
        button.style.setProperty("--well-color", mappedColor);
        button.classList.add("has-additive");
      }

      const isSelected = app.plateDesigner.selectedWells.has(well);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
      button.addEventListener("click", (event) => handleWellSelection(event, well, row, col));
      dom.interactivePlate.appendChild(button);
    }
  }
}

function renderAdditives() {
  if (!dom.additivesList) {
    return;
  }

  dom.additivesList.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const additive of app.plateDesigner.additives) {
    const card = document.createElement("article");
    card.className = "additive-card";

    const head = document.createElement("div");
    head.className = "additive-head";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = additive.name;
    nameInput.setAttribute("aria-label", "Additive name");
    nameInput.addEventListener("input", () => {
      additive.name = nameInput.value;
      updateExportPreview();
    });

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = additive.color;
    colorInput.setAttribute("aria-label", "Additive color");
    colorInput.addEventListener("input", () => {
      additive.color = colorInput.value;
      renderPlateDesigner();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "designer-action danger";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Remove ${additive.name}`);
    deleteButton.addEventListener("click", () => removeAdditive(additive.id));

    head.append(nameInput, colorInput, deleteButton);

    const fields = document.createElement("div");
    fields.className = "additive-fields";

    const volumeLabel = document.createElement("label");
    volumeLabel.textContent = "Volume (uL)";
    const volumeInput = document.createElement("input");
    volumeInput.type = "number";
    volumeInput.min = "0";
    volumeInput.step = "0.1";
    volumeInput.value = additive.volumeUl;
    volumeInput.addEventListener("input", () => {
      additive.volumeUl = volumeInput.value;
      updateExportPreview();
    });
    volumeLabel.appendChild(volumeInput);

    const notesLabel = document.createElement("label");
    notesLabel.textContent = "Notes";
    const notesInput = document.createElement("textarea");
    notesInput.rows = 2;
    notesInput.value = additive.notes;
    notesInput.addEventListener("input", () => {
      additive.notes = notesInput.value;
      updateExportPreview();
    });
    notesLabel.appendChild(notesInput);

    fields.append(volumeLabel, notesLabel);

    const footer = document.createElement("div");
    footer.className = "additive-footer";

    const mapped = document.createElement("span");
    mapped.textContent = `${additive.wells.size} well${additive.wells.size === 1 ? "" : "s"} assigned`;

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "designer-action";
    applyButton.textContent = "Assign selected wells";
    applyButton.disabled = !app.plateDesigner.selectedWells.size;
    applyButton.addEventListener("click", () => applySelectionToAdditive(additive.id));

    footer.append(mapped, applyButton);
    card.append(head, fields, footer);
    fragment.appendChild(card);
  }

  if (!app.plateDesigner.additives.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No additives yet. Add one to start mapping selected wells.";
    fragment.appendChild(empty);
  }

  dom.additivesList.appendChild(fragment);
}

function renderPlateDesigner() {
  if (dom.selectionHint) {
    dom.selectionHint.textContent = getSelectionLabel();
  }
  renderInteractivePlate();
  renderAdditives();
  updateExportPreview();
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
    metricLabel: METRIC_LABELS[app.state.metric],
    timeLabel
  };
}

function buildSeriesModel() {
  const visibleWells = app.data.wells.filter((well) => app.state.visibleGroups.has(well.group));
  return {
    timeHours: app.data.time.map((seconds) => seconds / 3600),
    data: computeDerivedSeries(visibleWells, app.state.metric),
    colorByGroup: app.colorByGroup,
    metricLabel: METRIC_LABELS[app.state.metric]
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

  dom.plateSizeSelect?.addEventListener("change", () => {
    app.plateDesigner.plateSize = Number.parseInt(dom.plateSizeSelect.value, 10) || 96;
    resetPlateDesignerForSize();
  });

  dom.clearSelection?.addEventListener("click", clearSelection);

  dom.addAdditive?.addEventListener("click", () => {
    app.plateDesigner.additives.push(createAdditive());
    renderPlateDesigner();
  });

  dom.downloadLayout?.addEventListener("click", () => {
    const payload = persistCurrentLayout();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "illucidate-plate-layout.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  dom.useLayoutLink?.addEventListener("click", () => {
    persistCurrentLayout();
  });
}

function updateSavedLayoutStatus() {
  if (!dom.savedLayoutStatus) {
    return;
  }
  const payload = loadPersistedLayout();
  if (!payload) {
    dom.savedLayoutStatus.textContent = "No saved designer layout yet. Open the dedicated designer page to create one.";
    return;
  }
  const additiveCount = Array.isArray(payload.additives) ? payload.additives.length : 0;
  const mappedWells = (payload.additives || []).reduce(
    (total, additive) => total + (Array.isArray(additive.wells) ? additive.wells.length : 0),
    0
  );
  dom.savedLayoutStatus.textContent = `Saved layout loaded: ${payload.plate_size}-well plate, ${additiveCount} additive${additiveCount === 1 ? "" : "s"}, ${mappedWells} mapped well${mappedWells === 1 ? "" : "s"}.`;
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

async function bootstrap() {
  if (isDesignerPage) {
    const saved = loadPersistedLayout();
    if (saved) {
      applyPersistedLayout(saved);
    } else {
      app.plateDesigner.additives = [createAdditive()];
    }
    bindEvents();
    renderPlateDesigner();
    requestAnimationFrame(() => {
      document.body.classList.add("is-ready");
    });
    return;
  }

  if (!isDashboardPage) {
    document.body.classList.add("is-ready");
    return;
  }

  try {
    const response = await fetch("data/demo-dataset.json");
    if (!response.ok) {
      throw new Error(`Failed to load demo data (${response.status})`);
    }
    const dataset = await response.json();
    validateDatasetSchema(dataset);

    app.data = dataset;
    app.groups = dataset.meta?.groups || Array.from(new Set(dataset.wells.map((well) => well.group)));
    app.groups.forEach((group, index) => app.colorByGroup.set(group, GROUP_COLOR_PALETTE[index % GROUP_COLOR_PALETTE.length]));
    app.state.visibleGroups = new Set(app.groups);
    app.state.targetGroup = app.groups.find((group) => group !== CONTROL_GROUP) || null;
    app.state.timeIndex = Math.min(6, Math.max(dataset.time.length - 1, 0));
    app.featureRows = app.data.wells.map((well) => computeWellFeatures(well, app.data.time));
    updateSavedLayoutStatus();

    renderGroupControls();
    syncTargetOptions();
    dom.timeSlider.max = String(Math.max(dataset.time.length - 1, 0));
    dom.timeSlider.value = String(app.state.timeIndex);
    bindEvents();
    bindLeadForm();
    exposeDebugSnapshot();
    renderAll();

    requestAnimationFrame(() => {
      document.body.classList.add("is-ready");
    });
  } catch (error) {
    const message = `Unable to initialize dashboard: ${error.message}`;
    if (dom.seriesChart) {
      dom.seriesChart.innerHTML = `<p class="empty-state">${message}</p>`;
    }
    if (dom.featureChart) {
      dom.featureChart.innerHTML = `<p class="empty-state">${message}</p>`;
    }
    if (dom.heatmapChart) {
      dom.heatmapChart.innerHTML = `<p class="empty-state">${message}</p>`;
    }
    document.body.classList.add("is-ready");
    console.error(error);
  }
}

bootstrap();
