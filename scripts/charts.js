function getD3() {
  return globalThis.d3;
}

function clearContainer(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function renderEmpty(el, message) {
  clearContainer(el);
  const text = document.createElement("p");
  text.className = "empty-state";
  text.textContent = message;
  el.appendChild(text);
}

function createTooltip(el) {
  let tip = el.querySelector(".chart-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    el.appendChild(tip);
  }
  return tip;
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function getChartSize(el, fallbackHeight = 300) {
  const width = Math.max(el.clientWidth || 0, 260);
  const height = Math.max(el.clientHeight || fallbackHeight, fallbackHeight);
  return { width, height };
}

function featureLabel(name) {
  return name.replaceAll("_", " ");
}

function getChartTokens(width) {
  const compact = width < 560;
  return {
    compact,
    axisFont: compact ? "10px" : "11px",
    captionFont: compact ? "9px" : "10px",
    valueFont: compact ? "10px" : "11px",
    seriesXTicks: compact ? 4 : 5,
    seriesYTicks: compact ? 4 : 5,
    featureXTicks: compact ? 4 : 5,
    gridStroke: "rgba(158, 205, 218, 0.1)",
    axisStroke: "rgba(170, 192, 201, 0.35)",
    captionFill: "rgba(170, 192, 201, 0.85)",
    cellLabelMinSize: compact ? 24 : 20
  };
}

function shortLabel(value, maxLength = 25) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

export function renderSeriesChart(el, model, state) {
  const d3 = getD3();
  if (!d3) {
    renderEmpty(el, "D3 library unavailable. Unable to render chart.");
    return;
  }

  const { timeHours, data, colorByGroup, metricLabel } = model;
  if (!timeHours.length || !data.series.length) {
    renderEmpty(el, "No series data available for selected groups.");
    return;
  }

  const allValues = [];
  for (const entry of data.series) {
    for (const value of entry.values) {
      if (Number.isFinite(value)) {
        allValues.push(value);
      }
    }
  }

  if (!allValues.length) {
    renderEmpty(el, "Selected data has no finite values.");
    return;
  }

  clearContainer(el);
  const tip = createTooltip(el);
  const { width, height } = getChartSize(el, 320);
  const tokens = getChartTokens(width);
  const margin = { top: 18, right: 14, bottom: 38, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const root = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain(d3.extent(timeHours)).range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(allValues))
    .nice()
    .range([innerHeight, 0]);

  const grid = d3.axisLeft(y).ticks(tokens.seriesYTicks).tickSize(-innerWidth).tickFormat("");
  root
    .append("g")
    .attr("class", "grid")
    .call(grid)
    .selectAll("line")
    .attr("stroke", tokens.gridStroke);

  root.select(".grid").select("path").remove();

  const line = d3
    .line()
    .defined((value) => Number.isFinite(value))
    .x((_, index) => x(timeHours[index]))
    .y((value) => y(value));

  root
    .append("g")
    .selectAll("path")
    .data(data.series)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (entry) => colorByGroup.get(entry.group) || "#8cb7c9")
    .attr("stroke-width", 1.1)
    .attr("stroke-opacity", 0.22)
    .attr("d", (entry) => line(entry.values));

  root
    .append("g")
    .selectAll("path")
    .data(data.groupMeans)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (entry) => colorByGroup.get(entry.group) || "#ffffff")
    .attr("stroke-width", 2.6)
    .attr("stroke-linecap", "round")
    .attr("d", (entry) => line(entry.values));

  root
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(tokens.seriesXTicks).tickFormat((value) => `${value.toFixed(1)}h`))
    .call((axis) => axis.selectAll("text").attr("fill", "#aac0c9").style("font-size", tokens.axisFont))
    .call((axis) => axis.selectAll("line,path").attr("stroke", tokens.axisStroke));

  root
    .append("g")
    .call(d3.axisLeft(y).ticks(tokens.seriesYTicks))
    .call((axis) => axis.selectAll("text").attr("fill", "#aac0c9").style("font-size", tokens.axisFont))
    .call((axis) => axis.selectAll("line,path").attr("stroke", tokens.axisStroke));

  root
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 32)
    .attr("fill", "#aac0c9")
    .attr("text-anchor", "middle")
    .style("font-size", tokens.axisFont)
    .text("Time (hours)");

  root
    .append("text")
    .attr("x", -innerHeight / 2)
    .attr("y", -40)
    .attr("fill", "#aac0c9")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .style("font-size", tokens.axisFont)
    .text(metricLabel);

  const crosshair = root
    .append("line")
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "rgba(243, 207, 115, 0.9)")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4 4")
    .style("opacity", 0);

  const meanMarkers = root
    .append("g")
    .selectAll("circle")
    .data(data.groupMeans)
    .join("circle")
    .attr("r", 3)
    .attr("fill", (entry) => colorByGroup.get(entry.group) || "#ffffff")
    .style("opacity", 0);

  const bisect = d3.bisector((value) => value).left;

  root
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .on("mousemove", (event) => {
      const [mouseX] = d3.pointer(event);
      const timeValue = x.invert(mouseX);
      const index = Math.max(0, Math.min(timeHours.length - 1, bisect(timeHours, timeValue)));
      const xPos = x(timeHours[index]);

      crosshair.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);
      meanMarkers
        .attr("cx", xPos)
        .attr("cy", (entry) => y(entry.values[index]))
        .style("opacity", 1);

      const groupLines = data.groupMeans
        .map((entry) => `${entry.group}: ${formatNumber(entry.values[index], 3)}`)
        .join("<br>");

      tip.innerHTML = `<strong>${timeHours[index].toFixed(2)} h</strong><br>${groupLines}`;
      tip.style.left = `${margin.left + xPos}px`;
      tip.style.top = `${margin.top + 8}px`;
      tip.classList.add("is-visible");
    })
    .on("mouseleave", () => {
      crosshair.style("opacity", 0);
      meanMarkers.style("opacity", 0);
      tip.classList.remove("is-visible");
    });

  if (state && state.focusGroup) {
    root
      .append("text")
      .attr("x", innerWidth - 2)
      .attr("y", 11)
      .attr("text-anchor", "end")
      .attr("fill", tokens.captionFill)
      .style("font-size", tokens.captionFont)
      .text(`Comparison target: ${state.focusGroup}`);
  }
}

export function renderFeatureChart(el, ranking, state) {
  const d3 = getD3();
  if (!d3) {
    renderEmpty(el, "D3 library unavailable. Unable to render chart.");
    return;
  }

  if (!ranking.length) {
    renderEmpty(el, "No valid comparison data for current target/control selection.");
    return;
  }

  const rows = ranking.slice(0, 8).reverse();
  clearContainer(el);
  const { width, height } = getChartSize(el, 320);
  const tokens = getChartTokens(width);
  const margin = { top: 16, right: 14, bottom: 32, left: 176 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const root = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const minValue = Math.min(0, d3.min(rows, (row) => row.effect_size));
  const maxValue = Math.max(0, d3.max(rows, (row) => row.effect_size));
  const domainPadding = Math.max(Math.abs(maxValue - minValue) * 0.12, 0.25);
  const domainMin = minValue - domainPadding;
  const domainMax = maxValue + domainPadding;

  const x = d3.scaleLinear().domain([domainMin, domainMax]).range([0, innerWidth]).nice();
  const y = d3
    .scaleBand()
    .domain(rows.map((row) => row.feature))
    .range([innerHeight, 0])
    .paddingInner(0.2);

  root
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "rgba(233, 242, 244, 0.4)")
    .attr("stroke-dasharray", "4 3");

  root
    .append("g")
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", (row) => Math.min(x(0), x(row.effect_size)))
    .attr("y", (row) => y(row.feature))
    .attr("width", (row) => Math.abs(x(row.effect_size) - x(0)))
    .attr("height", y.bandwidth())
    .attr("rx", 5)
    .attr("fill", (row) => (row.effect_size >= 0 ? "#29b7aa" : "#d8a85e"));

  root
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("x", (row) => (row.effect_size >= 0 ? x(row.effect_size) + 6 : x(row.effect_size) - 6))
    .attr("y", (row) => y(row.feature) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", (row) => (row.effect_size >= 0 ? "start" : "end"))
    .attr("fill", "#e9f2f4")
    .style("font-size", tokens.valueFont)
    .text((row) => row.effect_size.toFixed(2));

  root
    .append("g")
    .call(d3.axisBottom(x).ticks(tokens.featureXTicks))
    .attr("transform", `translate(0,${innerHeight})`)
    .call((axis) => axis.selectAll("text").attr("fill", "#aac0c9").style("font-size", tokens.axisFont))
    .call((axis) => axis.selectAll("line,path").attr("stroke", tokens.axisStroke));

  root
    .append("g")
    .call(d3.axisLeft(y).tickFormat((value) => shortLabel(featureLabel(value))))
    .call((axis) => axis.selectAll("text").attr("fill", "#aac0c9").style("font-size", tokens.axisFont))
    .call((axis) => axis.selectAll("line,path").attr("stroke", "rgba(170, 192, 201, 0.28)"));

  root
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 28)
    .attr("text-anchor", "middle")
    .attr("fill", tokens.captionFill)
    .style("font-size", tokens.captionFont)
    .text(`Effect size (Control vs ${state.targetGroup})`);
}

export function renderPlateHeatmap(el, heatmapModel, state) {
  const d3 = getD3();
  if (!d3) {
    renderEmpty(el, "D3 library unavailable. Unable to render chart.");
    return;
  }

  const { cells, metricLabel, timeLabel } = heatmapModel;
  if (!cells.length) {
    renderEmpty(el, "No heatmap data available.");
    return;
  }

  clearContainer(el);
  const tip = createTooltip(el);
  const { width, height } = getChartSize(el, 320);
  const tokens = getChartTokens(width);
  const margin = { top: 34, right: 12, bottom: 34, left: 38 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const cellSize = Math.min(innerWidth / 12, innerHeight / 8);
  const gridWidth = cellSize * 12;
  const gridHeight = cellSize * 8;
  const offsetX = (innerWidth - gridWidth) / 2;
  const offsetY = (innerHeight - gridHeight) / 2;

  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const root = svg
    .append("g")
    .attr("transform", `translate(${margin.left + offsetX},${margin.top + offsetY})`);

  const color = d3
    .scaleLinear()
    .domain([-2.5, 0, 2.5])
    .range(["#b85e5e", "#183448", "#2bc0aa"]);

  root
    .append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", (cell) => cell.col * cellSize)
    .attr("y", (cell) => cell.row * cellSize)
    .attr("width", cellSize - 1)
    .attr("height", cellSize - 1)
    .attr("rx", 3)
    .attr("fill", (cell) => {
      if (!cell.active) {
        return "rgba(78, 101, 115, 0.34)";
      }
      return Number.isFinite(cell.score) ? color(cell.score) : "rgba(100, 124, 138, 0.45)";
    })
    .attr("stroke", "rgba(160, 209, 223, 0.32)")
    .on("mousemove", (event, cell) => {
      tip.innerHTML = [
        `<strong>${cell.well}</strong> (${cell.group})`,
        `Value: ${formatNumber(cell.value, 3)}`,
        `Z-score: ${formatNumber(cell.score, 2)}`
      ].join("<br>");
      tip.style.left = `${event.offsetX}px`;
      tip.style.top = `${event.offsetY}px`;
      tip.classList.add("is-visible");
    })
    .on("mouseleave", () => {
      tip.classList.remove("is-visible");
    });

  if (cellSize >= tokens.cellLabelMinSize) {
    root
      .append("g")
      .selectAll("text")
      .data(cells)
      .join("text")
      .attr("x", (cell) => cell.col * cellSize + cellSize / 2)
      .attr("y", (cell) => cell.row * cellSize + cellSize / 2 + 3.6)
      .attr("text-anchor", "middle")
      .attr("fill", "#dbe9ee")
      .style("font-size", `${Math.max(7, Math.min(11, cellSize * 0.32))}px`)
      .style("pointer-events", "none")
      .text((cell) => cell.well);
  }

  root
    .append("g")
    .selectAll("text.row-label")
    .data(["A", "B", "C", "D", "E", "F", "G", "H"])
    .join("text")
    .attr("class", "row-label")
    .attr("x", -10)
    .attr("y", (_, index) => index * cellSize + cellSize / 2 + 3.4)
    .attr("text-anchor", "end")
    .attr("fill", "#aac0c9")
    .style("font-size", tokens.axisFont)
    .text((label) => label);

  root
    .append("g")
    .selectAll("text.col-label")
    .data(d3.range(1, 13))
    .join("text")
    .attr("class", "col-label")
    .attr("x", (_, index) => index * cellSize + cellSize / 2)
    .attr("y", -8)
    .attr("text-anchor", "middle")
    .attr("fill", "#aac0c9")
    .style("font-size", tokens.axisFont)
    .text((label) => label);

  svg
    .append("text")
    .attr("x", margin.left + 1)
    .attr("y", 14)
    .attr("fill", "#d2caa2")
    .style("font-size", tokens.captionFont)
    .text(`${metricLabel} at ${timeLabel}`);

  if (state && state.hiddenGroupsCount > 0) {
    svg
      .append("text")
      .attr("x", width - 8)
      .attr("y", 14)
      .attr("text-anchor", "end")
      .attr("fill", "#aac0c9")
      .style("font-size", tokens.captionFont)
      .text(`${state.hiddenGroupsCount} group(s) muted`);
  }
}
