function rollingMax(values, n) {
  return values.map((_, i) =>
    i < n - 1 ? null : Math.max(...values.slice(i - n + 1, i + 1))
  );
}

function rollingMin(values, n) {
  return values.map((_, i) =>
    i < n - 1 ? null : Math.min(...values.slice(i - n + 1, i + 1))
  );
}

function lag(arr, n) {
  if (n > 0) return Array(n).fill(null).concat(arr.slice(0, arr.length - n));
  if (n < 0) return arr.slice(-n).concat(Array(-n).fill(null));
  return arr;
}

function ichimoku(data, nFast = 20, nMed = 60, nSlow = 120) {
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const closes = data.map(d => d.close);

  const turnLine = highs.map((_, i) => {
    if (i < nFast - 1) return null;
    const max = Math.max(...highs.slice(i - nFast + 1, i + 1));
    const min = Math.min(...lows.slice(i - nFast + 1, i + 1));
    return (max + min) / 2;
  });

  const baseLine = highs.map((_, i) => {
    if (i < nMed - 1) return null;
    const max = Math.max(...highs.slice(i - nMed + 1, i + 1));
    const min = Math.min(...lows.slice(i - nMed + 1, i + 1));
    return (max + min) / 2;
  });

  const spanA = lag(turnLine.map((v, i) =>
    v == null || baseLine[i] == null ? null : (v + baseLine[i]) / 2
  ), nMed);

  const spanB = lag(highs.map((_, i) => {
    if (i < nSlow - 1) return null;
    const max = Math.max(...highs.slice(i - nSlow + 1, i + 1));
    const min = Math.min(...lows.slice(i - nSlow + 1, i + 1));
    return (max + min) / 2;
  }), nMed);

  return data.map((d, i) => ({
    turnLine: turnLine[i],
    baseLine: baseLine[i],
    spanA: spanA[i],
    spanB: spanB[i],
    close: closes[i]
  }));
}

function ichiCandleCheck(row) {
  const { spanA, spanB, close } = row;
  if (close >= spanA && spanA >= spanB) return "above green cloud";
  if (spanA >= close && close >= spanB) return "inside green cloud";
  if (spanA >= spanB && spanB >= close) return "below green cloud";
  if (spanB >= spanA && spanA >= close) return "below red cloud";
  if (spanB >= close && close >= spanA) return "inside red cloud";
  if (close >= spanB && spanB >= spanA) return "above red cloud";
  return "unclear";
}

function ichiCompare(clouds) {
  const last = clouds.length - 1;
  const current = ichiCandleCheck(clouds[last]);
  const prev = ichiCandleCheck(clouds[last - 1]);

  if (prev === current) return current;
  if (prev === "above green cloud" && current === "inside green cloud") return "broken into green cloud";
  if ((prev === "above green cloud" || prev === "inside green cloud") && current === "below green cloud") return "broken through green cloud";
  if ((prev === "inside green cloud" || prev === "below green cloud") && current === "above green cloud") return "bounced off green cloud support";
  if (prev === "below red cloud" && current === "inside red cloud") return "broken into red cloud";
  if ((prev === "below red cloud" || prev === "inside green cloud") && current === "above red cloud") return "broken through red cloud";
  if ((prev === "inside red cloud" || prev === "above red cloud") && current === "below red cloud") return "bounced off red cloud support";
  return "clouds too thin for a prediction";
}

function runIchimoku(data) {
  const clouds = ichimoku(data);
  return ichiCompare(clouds);
}

module.exports = { runIchimoku };
