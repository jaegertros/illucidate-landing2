/**
 * xlsx-parser.js — Client-side parser for PerkinElmer/VICTOR Nivo _list.xlsx exports.
 *
 * Extracts multi-channel kinetics data (LUM + multiple absorbance wavelengths)
 * from the "Well results" sheet and converts to the Illucidate dashboard format.
 *
 * Requires SheetJS (xlsx) loaded via CDN: globalThis.XLSX
 */

/**
 * Detect and parse all operation blocks from the Well results sheet.
 * Each block starts with a row like "N OPERATION" or "N Operation ..."
 * followed by metadata rows, then a "Well" / "Time(s)" header, then 96 data rows.
 */
function findOperationBlocks(sheet, range) {
  const blocks = [];
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  for (let r = 0; r <= maxRow; r++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const valA = cellA ? String(cellA.v || "") : "";
    const valB = cellB ? String(cellB.v || "") : "";

    // Match operation header: "4 OPERATION" or "4 Operation LUM-Plate Kinetics"
    if (/^\d+\s+operation/i.test(valA)) {
      const block = {
        operationRow: r,
        type: null,       // "LUM" or "ABS"
        label: null,      // e.g. "LUM-Kinetics", "ABS (F)-Kinetics"
        filter: null,     // e.g. "450/10nm", "700nm IR Blocker"
        unit: null,       // "Counts" or "OD"
        timeRow: -1,
        dataStartRow: -1,
        wellCount: 0,
        times: [],
        wells: []
      };

      // The operation name can be in cell B or appended to cell A
      if (valB && /kinetics/i.test(valB)) {
        block.label = valB.trim();
      } else if (/kinetics/i.test(valA)) {
        // Embedded in col A, e.g. "4 Operation LUM-Plate Kinetics"
        const match = valA.match(/operation\s+(.+)/i);
        block.label = match ? match[1].trim() : valA;
      } else {
        block.label = valB ? valB.trim() : valA.trim();
      }

      // Determine type from label
      if (/lum/i.test(block.label)) {
        block.type = "LUM";
      } else if (/abs/i.test(block.label)) {
        block.type = "ABS";
      }

      // Scan subsequent rows for metadata (filter, unit) until we hit "Well"
      for (let mr = r + 1; mr <= Math.min(r + 15, maxRow); mr++) {
        const mA = sheet[XLSX.utils.encode_cell({ r: mr, c: 0 })];
        const mB = sheet[XLSX.utils.encode_cell({ r: mr, c: 1 })];
        const mAv = mA ? String(mA.v || "") : "";
        const mBv = mB ? String(mB.v || "") : "";

        // Excitation/emission filter
        if (/filter/i.test(mAv)) {
          block.filter = mBv || mAv.replace(/.*filter\s*/i, "").trim();
        }

        // Measurement unit
        if (/unit/i.test(mAv)) {
          const unitVal = mBv || mAv.replace(/.*unit\s*/i, "").trim();
          block.unit = unitVal;
        }

        // Embedded metadata in col A (e.g. "Measurement unit Counts")
        if (/emission filter/i.test(mAv)) {
          block.filter = mAv.replace(/.*emission filter\s*/i, "").trim();
        }
        if (/measurement unit/i.test(mAv) && !/measurement unit$/.test(mAv.trim())) {
          block.unit = mAv.replace(/.*measurement unit\s*/i, "").trim();
        }

        // Time row: col A = "Well", col B = "Time(s)"
        if (/^well$/i.test(mAv.trim()) && /time/i.test(mBv)) {
          block.timeRow = mr;
          block.dataStartRow = mr + 1;

          // Read time values from col C onwards
          for (let c = 2; c <= maxCol; c++) {
            const tCell = sheet[XLSX.utils.encode_cell({ r: mr, c })];
            if (!tCell || tCell.v === "" || tCell.v == null) break;
            const t = Number(tCell.v);
            if (!Number.isFinite(t)) break;
            block.times.push(t);
          }
          break;
        }
      }

      if (block.timeRow >= 0) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}

/**
 * Read well data rows for a single operation block.
 * Returns a Map<wellName, number[]>.
 */
function readBlockData(sheet, block) {
  const numTimepoints = block.times.length;
  const wellData = new Map();
  const maxDataRows = 384; // Support up to 384-well plates

  for (let offset = 0; offset < maxDataRows; offset++) {
    const r = block.dataStartRow + offset;
    const wellCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!wellCell || !wellCell.v) break;

    const wellName = String(wellCell.v).trim();
    // Validate well name pattern: letter(s) + number
    if (!/^[A-P]\d{1,2}$/i.test(wellName)) break;

    const values = new Array(numTimepoints);
    for (let t = 0; t < numTimepoints; t++) {
      const dCell = sheet[XLSX.utils.encode_cell({ r, c: t + 2 })];
      if (dCell && dCell.v != null && dCell.v !== "") {
        const val = Number(dCell.v);
        values[t] = Number.isFinite(val) ? val : null;
      } else {
        values[t] = null;
      }
    }

    wellData.set(wellName, values);
  }

  block.wellCount = wellData.size;
  return wellData;
}

/**
 * Determine a canonical channel key from operation block metadata.
 */
function channelKey(block) {
  if (block.type === "LUM") {
    return "luminescence";
  }

  // For ABS, use the excitation filter wavelength
  if (block.filter) {
    const wlMatch = block.filter.match(/(\d{3})/);
    if (wlMatch) {
      const wl = parseInt(wlMatch[1], 10);
      if (wl === 600) return "od600";
      return `abs${wl}`;
    }
  }

  // Fallback: try to disambiguate from label
  if (/\(2\)/.test(block.label)) return "abs_2";
  if (/\(3\)/.test(block.label)) return "abs_3";
  if (/\(4\)/.test(block.label)) return "abs_4";
  return "abs_unknown";
}

/**
 * Determine a human-readable channel label.
 */
function channelLabel(key, block) {
  if (key === "luminescence") {
    const filter = block.filter || "Counts";
    return `Luminescence (${filter})`;
  }
  if (key === "od600") return "OD600 (600nm)";
  if (key.startsWith("abs")) {
    const wl = key.replace("abs", "");
    if (/^\d+$/.test(wl)) return `Absorbance ${wl}nm`;
  }
  return key;
}

/**
 * Extract protocol metadata from the "Parameters" sheet if present.
 */
function extractMetadata(workbook) {
  const meta = {
    protocolName: "",
    startDate: "",
    endDate: "",
    plateType: "",
    plateFormat: "",
    instrumentSerial: "",
    temperature: ""
  };

  const paramSheet = workbook.Sheets["Parameters"];
  if (!paramSheet) return meta;

  const range = XLSX.utils.decode_range(paramSheet["!ref"] || "A1");
  for (let r = 0; r <= range.e.r; r++) {
    const cellA = paramSheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const cellB = paramSheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const valA = cellA ? String(cellA.v || "") : "";
    const valB = cellB ? String(cellB.v || "") : "";

    if (/protocol name/i.test(valA)) meta.protocolName = valB;
    if (/measurement start date/i.test(valA)) meta.startDate = valB;
    if (/measurement end date/i.test(valA)) meta.endDate = valB;
    if (/plate type/i.test(valA)) meta.plateType = valB;
    if (/plate format/i.test(valA)) meta.plateFormat = valB;
    if (/instrument serial/i.test(valA)) meta.instrumentSerial = String(valB);
    if (/target temperature/i.test(valA)) meta.temperature = valB;
  }

  return meta;
}

/**
 * Main entry: parse an ArrayBuffer of a _list.xlsx file into Illucidate dataset format.
 *
 * Returns:
 * {
 *   meta: { title, timeUnit, channels, metricUnits, groups, ... },
 *   time: number[],
 *   wells: [{ well, group, luminescence, od600, abs450, abs560, abs595, ... }],
 *   channels: { key: { label, unit, filter }, ... }
 * }
 */
export function parseVictorXlsx(arrayBuffer) {
  const XLSX = globalThis.XLSX;
  if (!XLSX) {
    throw new Error("SheetJS (XLSX) library not loaded. Add the CDN script to the page.");
  }

  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  // Find Well results sheet
  const wellResultsName = workbook.SheetNames.find(
    (name) => /well\s*results/i.test(name)
  );
  if (!wellResultsName) {
    throw new Error("No 'Well results' sheet found in the workbook.");
  }

  const sheet = workbook.Sheets[wellResultsName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

  // Find all operation blocks
  const blocks = findOperationBlocks(sheet, range);
  if (!blocks.length) {
    throw new Error("No measurement operation blocks found in the data.");
  }

  // Read data for each block
  const channelDataMap = new Map(); // channelKey -> Map<wellName, number[]>
  const channelsMeta = {};          // channelKey -> { label, unit, filter }

  for (const block of blocks) {
    const key = channelKey(block);
    const data = readBlockData(sheet, block);
    channelDataMap.set(key, data);
    channelsMeta[key] = {
      label: channelLabel(key, block),
      unit: block.unit || (block.type === "LUM" ? "Counts" : "OD"),
      filter: block.filter || null
    };
  }

  // Use the time array from the first block (they're all very close)
  // Prefer OD600 time if available, otherwise use whatever's first
  const od600Block = blocks.find((b) => channelKey(b) === "od600");
  const timeSource = od600Block || blocks[0];
  const time = timeSource.times;

  // Collect all well names (union across all blocks)
  const allWellNames = new Set();
  for (const [, data] of channelDataMap) {
    for (const name of data.keys()) {
      allWellNames.add(name);
    }
  }

  // Sort wells in plate order
  const sortedWells = Array.from(allWellNames).sort((a, b) => {
    const rowA = a.charCodeAt(0);
    const rowB = b.charCodeAt(0);
    if (rowA !== rowB) return rowA - rowB;
    return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  });

  // Build wells array
  const wells = sortedWells.map((wellName) => {
    const well = { well: wellName, group: "Unassigned" };
    for (const [key, data] of channelDataMap) {
      well[key] = data.get(wellName) || new Array(time.length).fill(null);
    }
    return well;
  });

  // Extract protocol metadata
  const protocolMeta = extractMetadata(workbook);

  // Build metricUnits from channels
  const metricUnits = {};
  for (const [key, info] of Object.entries(channelsMeta)) {
    metricUnits[key] = info.unit;
  }
  // Always add ratio if we have both od600 and luminescence
  if (channelsMeta.od600 && channelsMeta.luminescence) {
    metricUnits.ratio = "RLU/OD600";
    channelsMeta.ratio = { label: "RLU / OD600", unit: "RLU/OD600", filter: null };
  }

  const channelKeys = Object.keys(channelsMeta);

  return {
    meta: {
      title: protocolMeta.protocolName || "Imported Plate Reader Data",
      timeUnit: "seconds",
      metricUnits,
      groups: ["Unassigned"],
      channels: channelKeys,
      protocolMeta,
      importedAt: new Date().toISOString(),
      source: "victor_xlsx"
    },
    time,
    wells,
    channels: channelsMeta
  };
}
