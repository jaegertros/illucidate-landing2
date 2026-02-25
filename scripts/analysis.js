const EPSILON = 1e-6;

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function metricSeriesForWell(well, metric) {
  if (!well) {
    return [];
  }

  if (metric === "ratio") {
    const od = Array.isArray(well.od600) ? well.od600 : [];
    const lum = Array.isArray(well.luminescence) ? well.luminescence : [];
    const length = Math.min(od.length, lum.length);
    const ratio = new Array(length);
    for (let i = 0; i < length; i += 1) {
      const odValue = isFiniteNumber(od[i]) ? od[i] : NaN;
      const lumValue = isFiniteNumber(lum[i]) ? lum[i] : NaN;
      ratio[i] = isFiniteNumber(lumValue) && isFiniteNumber(odValue)
        ? lumValue / Math.max(odValue, EPSILON)
        : NaN;
    }
    return ratio;
  }

  // Support any channel key (od600, luminescence, abs450, abs560, abs595, etc.)
  if (Array.isArray(well[metric])) {
    return well[metric];
  }

  return [];
}

function finiteValues(series) {
  return series.filter((value) => isFiniteNumber(value));
}

function finiteValuesWithIndex(series) {
  const points = [];
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i];
    if (isFiniteNumber(value)) {
      points.push({ index: i, value });
    }
  }
  return points;
}

function mean(values) {
  if (!values.length) {
    return NaN;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function variance(values) {
  if (values.length < 2) {
    return 0;
  }
  const m = mean(values);
  let total = 0;
  for (const value of values) {
    total += (value - m) ** 2;
  }
  return total / (values.length - 1);
}

function linearSlopeFromPoints(points) {
  if (points.length < 2) {
    return 0;
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = points[i].value;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const denominator = n * sumXX - sumX ** 2;
  if (Math.abs(denominator) < EPSILON) {
    return 0;
  }
  return (n * sumXY - sumX * sumY) / denominator;
}

function trapezoidAuc(series, time) {
  const points = finiteValuesWithIndex(series);
  if (points.length < 2) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    const t0 = isFiniteNumber(time[left.index]) ? time[left.index] : left.index;
    const t1 = isFiniteNumber(time[right.index]) ? time[right.index] : right.index;
    area += ((left.value + right.value) / 2) * Math.max(t1 - t0, 0);
  }
  return area;
}

function timeToThresholdIndex(series, factor, baselineValue) {
  if (!series.length) {
    return 0;
  }
  if (!isFiniteNumber(baselineValue)) {
    return series.length - 1;
  }
  const threshold = baselineValue * factor;
  for (let i = 0; i < series.length; i += 1) {
    if (isFiniteNumber(series[i]) && series[i] >= threshold) {
      return i;
    }
  }
  return series.length - 1;
}

function firstNFinite(series, count) {
  const values = [];
  for (let i = 0; i < series.length && values.length < count; i += 1) {
    if (isFiniteNumber(series[i])) {
      values.push(series[i]);
    }
  }
  return values;
}

export function computeDerivedSeries(wells, metric) {
  const series = wells.map((well) => ({
    well: well.well,
    group: well.group,
    values: metricSeriesForWell(well, metric)
  }));

  const timeLength = series.reduce((maxLength, entry) => Math.max(maxLength, entry.values.length), 0);
  const grouped = new Map();

  for (const entry of series) {
    if (!grouped.has(entry.group)) {
      grouped.set(entry.group, {
        sums: new Array(timeLength).fill(0),
        counts: new Array(timeLength).fill(0)
      });
    }
    const groupData = grouped.get(entry.group);
    for (let i = 0; i < entry.values.length; i += 1) {
      const value = entry.values[i];
      if (isFiniteNumber(value)) {
        groupData.sums[i] += value;
        groupData.counts[i] += 1;
      }
    }
  }

  const groupMeans = Array.from(grouped.entries()).map(([group, data]) => ({
    group,
    values: data.sums.map((sum, index) => (data.counts[index] > 0 ? sum / data.counts[index] : NaN))
  }));

  return { metric, series, groupMeans, timeLength };
}

export function computeWellFeatures(well, time) {
  const odSeries = metricSeriesForWell(well, "od600");
  const lumSeries = metricSeriesForWell(well, "luminescence");
  const ratioSeries = metricSeriesForWell(well, "ratio");

  const odFirst5 = firstNFinite(odSeries, 5);
  const odFirst10 = finiteValuesWithIndex(odSeries).slice(0, 10);
  const lumFirst5 = firstNFinite(lumSeries, 5);
  const lumFirst10 = finiteValuesWithIndex(lumSeries).slice(0, 10);
  const ratioFirst5 = firstNFinite(ratioSeries, 5);
  const ratioFirst10 = finiteValuesWithIndex(ratioSeries).slice(0, 10);

  const baselineOd = mean(odFirst5);
  const baselineLum = mean(lumFirst5);
  const baselineRatio = mean(ratioFirst5);

  return {
    well: well.well,
    group: well.group,
    baseline_mean: baselineOd,
    early_slope: linearSlopeFromPoints(odFirst10),
    time_to_1p2x: timeToThresholdIndex(odSeries, 1.2, baselineOd),
    early_ratio_mean: baselineRatio,
    auc: trapezoidAuc(odSeries, time),
    lum_baseline_mean: baselineLum,
    lum_early_slope: linearSlopeFromPoints(lumFirst10),
    lum_time_to_1p2x: timeToThresholdIndex(lumSeries, 1.2, baselineLum),
    lum_auc: trapezoidAuc(lumSeries, time),
    ratio_slope: linearSlopeFromPoints(ratioFirst10),
    ratio_auc: trapezoidAuc(ratioSeries, time),
    ratio_baseline_mean: baselineRatio
  };
}

export function rankFeaturesByComparison(features, controlGroup, targetGroup) {
  if (!features.length) {
    return [];
  }

  const candidateKeys = Object.keys(features[0]).filter(
    (key) => !["well", "group"].includes(key) && typeof features[0][key] === "number"
  );

  const ranking = [];

  for (const key of candidateKeys) {
    const controlValues = features
      .filter((entry) => entry.group === controlGroup && isFiniteNumber(entry[key]))
      .map((entry) => entry[key]);
    const targetValues = features
      .filter((entry) => entry.group === targetGroup && isFiniteNumber(entry[key]))
      .map((entry) => entry[key]);

    if (controlValues.length < 2 || targetValues.length < 2) {
      continue;
    }

    const controlMean = mean(controlValues);
    const targetMean = mean(targetValues);
    const controlVar = variance(controlValues);
    const targetVar = variance(targetValues);

    const pooledNumerator = ((controlValues.length - 1) * controlVar) + ((targetValues.length - 1) * targetVar);
    const pooledDenominator = Math.max(controlValues.length + targetValues.length - 2, 1);
    const pooledSd = Math.sqrt(Math.max(pooledNumerator / pooledDenominator, 0));

    const effectSize = (targetMean - controlMean) / Math.max(pooledSd, EPSILON);

    ranking.push({
      feature: key,
      effect_size: effectSize,
      abs_effect_size: Math.abs(effectSize),
      control_mean: controlMean,
      target_mean: targetMean,
      delta: targetMean - controlMean,
      n_control: controlValues.length,
      n_target: targetValues.length
    });
  }

  ranking.sort((a, b) => b.abs_effect_size - a.abs_effect_size);
  return ranking;
}

export function computeDetectionScore(well, metric, timeIndex, zStats = { mean: 0, std: 1 }) {
  const series = metricSeriesForWell(well, metric);
  const value = series[timeIndex];
  if (!isFiniteNumber(value)) {
    return NaN;
  }

  const meanValue = isFiniteNumber(zStats.mean) ? zStats.mean : 0;
  const stdValue = isFiniteNumber(zStats.std) && zStats.std > EPSILON ? zStats.std : 1;
  const rawScore = (value - meanValue) / stdValue;
  return Math.max(-2.5, Math.min(2.5, rawScore));
}

export function computeZStats(wells, metric, timeIndex) {
  const values = wells
    .map((well) => metricSeriesForWell(well, metric)[timeIndex])
    .filter((value) => isFiniteNumber(value));

  if (!values.length) {
    return { mean: 0, std: 1 };
  }

  return {
    mean: mean(values),
    std: Math.sqrt(Math.max(variance(values), EPSILON))
  };
}

export function metricValue(well, metric, timeIndex) {
  return metricSeriesForWell(well, metric)[timeIndex];
}

/**
 * Compute features for an arbitrary channel (not just the hardcoded od600/lum).
 * Returns an object with prefixed feature keys: {channelKey}_baseline_mean, etc.
 */
export function computeChannelFeatures(well, time, channelKey) {
  const series = metricSeriesForWell(well, channelKey);
  const first5 = firstNFinite(series, 5);
  const first10 = finiteValuesWithIndex(series).slice(0, 10);
  const baseline = mean(first5);

  return {
    [`${channelKey}_baseline_mean`]: baseline,
    [`${channelKey}_early_slope`]: linearSlopeFromPoints(first10),
    [`${channelKey}_time_to_1p2x`]: timeToThresholdIndex(series, 1.2, baseline),
    [`${channelKey}_auc`]: trapezoidAuc(series, time)
  };
}

/**
 * Compute features for all selected channels in a multivariate analysis.
 * Includes cross-channel ratios for each ABS channel vs luminescence.
 */
export function computeMultiChannelFeatures(well, time, channels) {
  const base = {
    well: well.well,
    group: well.group
  };

  for (const ch of channels) {
    if (ch === "ratio") continue; // skip virtual ratio
    Object.assign(base, computeChannelFeatures(well, time, ch));
  }

  // Add cross-channel ratios if luminescence is present
  if (channels.includes("luminescence")) {
    const lumSeries = metricSeriesForWell(well, "luminescence");
    for (const ch of channels) {
      if (ch === "luminescence" || ch === "ratio") continue;
      const absSeries = metricSeriesForWell(well, ch);
      const len = Math.min(lumSeries.length, absSeries.length);
      const crossRatio = new Array(len);
      for (let i = 0; i < len; i++) {
        const lv = isFiniteNumber(lumSeries[i]) ? lumSeries[i] : NaN;
        const av = isFiniteNumber(absSeries[i]) ? absSeries[i] : NaN;
        crossRatio[i] = isFiniteNumber(lv) && isFiniteNumber(av)
          ? lv / Math.max(av, EPSILON)
          : NaN;
      }
      const crFirst5 = firstNFinite(crossRatio, 5);
      const crFirst10 = finiteValuesWithIndex(crossRatio).slice(0, 10);
      const crBaseline = mean(crFirst5);
      base[`lum_${ch}_ratio_slope`] = linearSlopeFromPoints(crFirst10);
      base[`lum_${ch}_ratio_auc`] = trapezoidAuc(crossRatio, time);
      base[`lum_${ch}_ratio_baseline`] = crBaseline;
    }
  }

  return base;
}
