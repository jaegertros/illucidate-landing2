const MEDIA_PRESETS = {
  LB: { volumeUl: 200, unit: "uL", notes: "Luria-Bertani broth" },
  M9: { volumeUl: 200, unit: "uL", notes: "M9 minimal medium" },
  TSB: { volumeUl: 200, unit: "uL", notes: "Tryptic Soy Broth" },
  PBS: { volumeUl: 100, unit: "uL", notes: "Phosphate-buffered saline" }
};

const UNIT_OPTIONS = [
  { value: "uL", label: "µL" },
  { value: "mL", label: "mL" },
  { value: "mM", label: "mM" },
  { value: "uM", label: "µM" },
  { value: "nM", label: "nM" },
  { value: "mg/mL", label: "mg/mL" },
  { value: "ug/mL", label: "µg/mL" },
  { value: "%v/v", label: "% v/v" },
  { value: "%w/v", label: "% w/v" },
  { value: "CFU/mL", label: "CFU/mL" },
  { value: "PFU/mL", label: "PFU/mL" },
  { value: "x", label: "x (fold)" }
];

const PLATE_LAYOUTS = {
  6: { rows: 2, cols: 3 },
  12: { rows: 3, cols: 4 },
  24: { rows: 4, cols: 6 },
  48: { rows: 6, cols: 8 },
  96: { rows: 8, cols: 12 },
  384: { rows: 16, cols: 24 }
};

const GROUP_COLORS = ["#4fc3b8", "#4d9fd1", "#f3cf73", "#ef8f8f", "#b2a3ff", "#8be48d", "#f7a6ff", "#87d9ff"];

const dom = {
  plateSizeSelect: document.getElementById("plate-size-select"),
  clearSelection: document.getElementById("clear-selection"),
  selectionHint: document.getElementById("selection-hint"),
  interactivePlate: document.getElementById("interactive-plate"),
  addGroup: document.getElementById("add-group"),
  groupsList: document.getElementById("groups-list"),
  plateExport: document.getElementById("plate-export"),
  downloadPlateJson: document.getElementById("download-plate-json"),
  sendToDashboard: document.getElementById("send-to-dashboard")
};

const designerState = {
  plateSize: 96,
  selectedWells: new Set(),
  isDragging: false,
  dragAnchor: null,
  baseSelection: new Set(),
  groups: []
};

let groupIdCounter = 1;

function wellName(row, col) {
  const rowLabel = String.fromCharCode(65 + row);
  return `${rowLabel}${col + 1}`;
}

function getPlateLayout() {
  return PLATE_LAYOUTS[designerState.plateSize] || PLATE_LAYOUTS[96];
}

function getSelectionLabel() {
  const count = designerState.selectedWells.size;
  if (!count) {
    return "Tip: click and drag to select wells. Ctrl/Cmd-click keeps existing selection.";
  }
  return `${count} well${count === 1 ? "" : "s"} selected.`;
}

function createGroup() {
  const id = groupIdCounter++;
  const color = GROUP_COLORS[(id - 1) % GROUP_COLORS.length];
  return {
    id,
    name: `Group ${id}`,
    color,
    wells: new Set(),
    organism: { species: "", strain: "", cellCount: "" },
    additives: [],
    expanded: false
  };
}

function getWellColor(well) {
  for (const group of designerState.groups) {
    if (group.wells.has(well)) return group.color;
  }
  return null;
}

function applySelectionToGroup(groupId) {
  const targetGroup = designerState.groups.find((group) => group.id === groupId);
  if (!targetGroup || !designerState.selectedWells.size) return;

  for (const group of designerState.groups) {
    if (group.id !== groupId) {
      for (const well of designerState.selectedWells) {
        group.wells.delete(well);
      }
    }
  }

  targetGroup.wells = new Set([...targetGroup.wells, ...designerState.selectedWells]);
  renderDesigner();
}

function removeGroup(groupId) {
  designerState.groups = designerState.groups.filter((group) => group.id !== groupId);
  renderDesigner();
}

function clearSelection() {
  designerState.selectedWells.clear();
  renderDesigner();
}

function resetForPlateSize() {
  designerState.selectedWells.clear();
  designerState.isDragging = false;
  designerState.dragAnchor = null;
  designerState.baseSelection = new Set();

  const { rows, cols } = getPlateLayout();
  const allowedWells = new Set();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      allowedWells.add(wellName(row, col));
    }
  }

  for (const group of designerState.groups) {
    group.wells = new Set([...group.wells].filter((well) => allowedWells.has(well)));
  }

  renderDesigner();
}

function handleWellMouseDown(event, well, row, col) {
  designerState.isDragging = true;
  designerState.dragAnchor = { row, col, well };

  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    designerState.selectedWells.clear();
  }

  designerState.baseSelection = new Set(designerState.selectedWells);
  designerState.selectedWells.add(well);
  renderInteractivePlate();
}

function handleWellMouseEnter(_event, _well, row, col) {
  if (!designerState.isDragging || !designerState.dragAnchor) return;

  const anchor = designerState.dragAnchor;
  const nextSelection = new Set(designerState.baseSelection);
  const minRow = Math.min(anchor.row, row);
  const maxRow = Math.max(anchor.row, row);
  const minCol = Math.min(anchor.col, col);
  const maxCol = Math.max(anchor.col, col);

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    for (let colIndex = minCol; colIndex <= maxCol; colIndex += 1) {
      nextSelection.add(wellName(rowIndex, colIndex));
    }
  }

  designerState.selectedWells = nextSelection;
  const plateCells = dom.interactivePlate?.querySelectorAll(".plate-cell") || [];
  for (const cell of plateCells) {
    const isSelected = nextSelection.has(cell.textContent || "");
    cell.classList.toggle("is-selected", isSelected);
    cell.setAttribute("aria-selected", String(isSelected));
  }
  if (dom.selectionHint) dom.selectionHint.textContent = getSelectionLabel();
}

function renderInteractivePlate() {
  if (!dom.interactivePlate) return;

  const { rows, cols } = getPlateLayout();
  dom.interactivePlate.replaceChildren();
  dom.interactivePlate.style.setProperty("--plate-cols", String(cols));

  const headerCorner = document.createElement("div");
  headerCorner.className = "plate-axis plate-axis-corner";
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

      const isSelected = designerState.selectedWells.has(well);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-selected", String(isSelected));

      button.addEventListener("mousedown", (event) => handleWellMouseDown(event, well, row, col));
      button.addEventListener("mouseenter", (event) => handleWellMouseEnter(event, well, row, col));

      dom.interactivePlate.appendChild(button);
    }
  }
}

function renderGroups() {
  if (!dom.groupsList) return;

  dom.groupsList.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const group of designerState.groups) {
    const card = document.createElement("article");
    card.className = "additive-card";

    const head = document.createElement("div");
    head.className = "additive-head";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = group.name;
    nameInput.addEventListener("input", () => {
      group.name = nameInput.value;
      updateExportPreview();
    });

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = group.color;
    colorInput.addEventListener("input", (event) => {
      group.color = event.target.value;
      const cells = dom.interactivePlate?.querySelectorAll(".plate-cell") || [];
      for (const cell of cells) {
        if (group.wells.has(cell.textContent || "")) {
          cell.style.setProperty("--well-color", group.color);
        }
      }
    });
    colorInput.addEventListener("change", updateExportPreview);

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "designer-action group-expand-btn";
    expandBtn.textContent = group.expanded ? "−" : "+";
    expandBtn.title = group.expanded ? "Collapse" : "Expand";
    expandBtn.addEventListener("click", () => {
      group.expanded = !group.expanded;
      renderGroups();
    });

    const deleteGroupButton = document.createElement("button");
    deleteGroupButton.type = "button";
    deleteGroupButton.className = "designer-action danger";
    deleteGroupButton.textContent = "×";
    deleteGroupButton.addEventListener("click", () => removeGroup(group.id));

    head.append(expandBtn, nameInput, colorInput, deleteGroupButton);

    // Collapsible body section
    const bodySection = document.createElement("div");
    bodySection.className = "collapsible-section";
    if (!group.expanded) {
      bodySection.classList.add("is-collapsed");
    }

    const organismFields = document.createElement("div");
    organismFields.className = "additive-fields";
    organismFields.innerHTML = "<strong>Organism</strong>";

    const speciesInput = document.createElement("input");
    speciesInput.type = "text";
    speciesInput.placeholder = "Species (e.g. E. coli)";
    speciesInput.value = group.organism.species;
    speciesInput.addEventListener("input", () => {
      group.organism.species = speciesInput.value;
      updateExportPreview();
    });

    const strainInput = document.createElement("input");
    strainInput.type = "text";
    strainInput.placeholder = "Strain (e.g. O157:H7)";
    strainInput.value = group.organism.strain;
    strainInput.addEventListener("input", () => {
      group.organism.strain = strainInput.value;
      updateExportPreview();
    });

    organismFields.append(speciesInput, strainInput);

    const additivesContainer = document.createElement("div");
    additivesContainer.style.marginTop = "4px";
    additivesContainer.style.paddingTop = "4px";
    additivesContainer.style.borderTop = "1px solid rgba(127, 187, 206, 0.15)";

    const additivesHead = document.createElement("div");
    additivesHead.style.display = "flex";
    additivesHead.style.justifyContent = "space-between";
    additivesHead.style.alignItems = "center";
    additivesHead.style.gap = "4px";

    const additivesLabel = document.createElement("strong");
    additivesLabel.textContent = "Additives";
    additivesLabel.style.fontSize = "var(--fs-2xs)";
    additivesLabel.style.color = "var(--slate-500)";
    additivesLabel.style.textTransform = "uppercase";
    additivesLabel.style.letterSpacing = "0.05em";

    const presetSelect = document.createElement("select");
    presetSelect.style.fontSize = "var(--fs-2xs)";
    presetSelect.style.padding = "2px 6px";
    presetSelect.innerHTML = "<option value=\"\">+ Add...</option><option value=\"custom\">Custom</option>";
    for (const key of Object.keys(MEDIA_PRESETS)) {
      presetSelect.innerHTML += `<option value="${key}">${key}</option>`;
    }

    presetSelect.addEventListener("change", () => {
      if (!presetSelect.value) return;
      if (presetSelect.value === "custom") {
        group.additives.push({ name: "", amount: "", unit: "uL", notes: "" });
      } else {
        const preset = MEDIA_PRESETS[presetSelect.value];
        group.additives.push({
          name: presetSelect.value,
          amount: preset.volumeUl,
          unit: preset.unit || "uL",
          notes: preset.notes
        });
      }
      presetSelect.value = "";
      renderGroups();
    });

    additivesHead.append(additivesLabel, presetSelect);
    additivesContainer.append(additivesHead);

    group.additives.forEach((additive, index) => {
      // Migrate legacy data: volumeUl → amount
      if (additive.volumeUl !== undefined && additive.amount === undefined) {
        additive.amount = additive.volumeUl;
        additive.unit = additive.unit || "uL";
      }

      const additiveRow = document.createElement("div");
      additiveRow.style.display = "flex";
      additiveRow.style.gap = "4px";
      additiveRow.style.marginTop = "4px";
      additiveRow.style.alignItems = "center";

      const additiveName = document.createElement("input");
      additiveName.placeholder = "Name";
      additiveName.value = additive.name;
      additiveName.style.flex = "1 1 0";
      additiveName.style.minWidth = "0";
      additiveName.addEventListener("input", () => {
        additive.name = additiveName.value;
        updateExportPreview();
      });

      const additiveAmount = document.createElement("input");
      additiveAmount.type = "number";
      additiveAmount.placeholder = "Qty";
      additiveAmount.style.width = "50px";
      additiveAmount.value = additive.amount ?? "";
      additiveAmount.addEventListener("input", () => {
        additive.amount = additiveAmount.value;
        updateExportPreview();
      });

      const unitSelect = document.createElement("select");
      unitSelect.style.fontSize = "var(--fs-2xs)";
      unitSelect.style.padding = "2px 4px";
      unitSelect.style.width = "65px";
      for (const opt of UNIT_OPTIONS) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        unitSelect.appendChild(option);
      }
      unitSelect.value = additive.unit || "uL";
      unitSelect.addEventListener("change", () => {
        additive.unit = unitSelect.value;
        updateExportPreview();
      });

      const removeAdditiveButton = document.createElement("button");
      removeAdditiveButton.textContent = "×";
      removeAdditiveButton.className = "designer-action danger";
      removeAdditiveButton.style.padding = "2px 6px";
      removeAdditiveButton.addEventListener("click", () => {
        group.additives.splice(index, 1);
        renderGroups();
      });

      additiveRow.append(additiveName, additiveAmount, unitSelect, removeAdditiveButton);
      additivesContainer.append(additiveRow);
    });

    const footer = document.createElement("div");
    footer.className = "additive-footer";

    const mapped = document.createElement("span");
    mapped.textContent = `${group.wells.size} well(s)`;

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "designer-action";
    applyButton.textContent = "Assign selected";
    applyButton.disabled = !designerState.selectedWells.size;
    applyButton.addEventListener("click", () => applySelectionToGroup(group.id));

    footer.append(mapped, applyButton);

    bodySection.append(organismFields, additivesContainer, footer);

    // Build summary line for collapsed state
    const summaryParts = [];
    if (group.wells.size) summaryParts.push(`${group.wells.size} well(s)`);
    if (group.organism.species) summaryParts.push(group.organism.species);
    if (group.additives.length) summaryParts.push(`${group.additives.length} additive(s)`);
    const summaryEl = document.createElement("span");
    summaryEl.className = "group-summary";
    summaryEl.textContent = summaryParts.join(" · ") || "empty";

    if (group.expanded) {
      card.append(head, bodySection);
    } else {
      card.append(head, summaryEl);
    }
    fragment.appendChild(card);
  }

  if (!designerState.groups.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No groups yet. Create one to assign wells and media.";
    fragment.appendChild(empty);
  }

  dom.groupsList.appendChild(fragment);
}

function buildPayload() {
  return {
    plate_size: designerState.plateSize,
    groups: designerState.groups.map((group) => ({
      name: group.name,
      color: group.color,
      organism: group.organism?.species ? group.organism : null,
      additives: group.additives.map((additive) => ({
        name: additive.name,
        amount: additive.amount ? Number(additive.amount) : (additive.volumeUl ? Number(additive.volumeUl) : null),
        unit: additive.unit || "uL",
        notes: additive.notes || null
      })),
      wells: [...group.wells].sort()
    }))
  };
}

function updateExportPreview() {
  if (!dom.plateExport) return;
  dom.plateExport.textContent = JSON.stringify(buildPayload(), null, 2);
}

function saveToSession() {
  const payload = buildPayload();
  sessionStorage.setItem("illucidate_custom_plate", JSON.stringify(payload));
  return payload;
}

function downloadJson() {
  const payload = buildPayload();
  const serialized = JSON.stringify(payload, null, 2);
  const blob = new Blob([serialized], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `illucidate_plate_${payload.plate_size}well.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function exportToIllucidate() {
  saveToSession();
  window.location.href = "/";
}

function maybeHydrateFromSession() {
  const raw = sessionStorage.getItem("illucidate_custom_plate");
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    const parsedSize = Number.parseInt(String(parsed.plate_size), 10);
    if (PLATE_LAYOUTS[parsedSize]) {
      designerState.plateSize = parsedSize;
    }

    const sourceGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
    designerState.groups = sourceGroups.map((group) => {
      const nextGroup = createGroup();
      nextGroup.name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : nextGroup.name;
      nextGroup.color = typeof group.color === "string" && group.color.trim() ? group.color : nextGroup.color;
      nextGroup.organism = group.organism && typeof group.organism === "object"
        ? {
            species: String(group.organism.species || ""),
            strain: String(group.organism.strain || ""),
            cellCount: String(group.organism.cellCount || "")
          }
        : nextGroup.organism;
      nextGroup.additives = Array.isArray(group.additives)
        ? group.additives.map((additive) => ({
            name: String(additive?.name || ""),
            amount: additive?.amount ?? additive?.volume_uL ?? additive?.volumeUl ?? "",
            unit: String(additive?.unit || "uL"),
            notes: String(additive?.notes || "")
          }))
        : [];
      nextGroup.wells = new Set(Array.isArray(group.wells) ? group.wells.map((well) => String(well)) : []);
      return nextGroup;
    });
  } catch {
    // Ignore malformed session payload.
  }
}

function renderDesigner() {
  if (dom.selectionHint) {
    dom.selectionHint.textContent = getSelectionLabel();
  }
  renderInteractivePlate();
  renderGroups();
  updateExportPreview();
}

function bindEvents() {
  window.addEventListener("mouseup", () => {
    if (designerState.isDragging) {
      designerState.isDragging = false;
      designerState.dragAnchor = null;
      if (dom.selectionHint) dom.selectionHint.textContent = getSelectionLabel();
      renderGroups();
    }
  });

  dom.plateSizeSelect?.addEventListener("change", () => {
    designerState.plateSize = Number.parseInt(dom.plateSizeSelect.value, 10) || 96;
    resetForPlateSize();
  });

  dom.clearSelection?.addEventListener("click", clearSelection);
  dom.addGroup?.addEventListener("click", () => {
    designerState.groups.push(createGroup());
    renderDesigner();
  });
  dom.downloadPlateJson?.addEventListener("click", downloadJson);
  dom.sendToDashboard?.addEventListener("click", exportToIllucidate);
}

async function bootstrapDesigner() {
  if (!dom.interactivePlate) return;

  const hasSession = sessionStorage.getItem("illucidate_custom_plate");
  if (hasSession) {
    maybeHydrateFromSession();
  } else {
    try {
      const resp = await fetch("data/default-plate-map.json");
      if (resp.ok) {
        const defaultMap = await resp.json();
        sessionStorage.setItem("illucidate_custom_plate", JSON.stringify(defaultMap));
        maybeHydrateFromSession();
      }
    } catch { /* silent fallback to empty designer */ }
  }

  if (dom.plateSizeSelect) {
    dom.plateSizeSelect.value = String(designerState.plateSize);
  }
  bindEvents();
  renderDesigner();

  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
}

bootstrapDesigner();
