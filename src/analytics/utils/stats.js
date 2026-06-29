'use strict';

/**
 * Чистые математические утилиты для анализаторов.
 * Никаких внешних зависимостей. Все функции stateless.
 */

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return s / arr.length;
}

function std(arr) {
  return Math.sqrt(variance(arr));
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function min(arr) {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m === Infinity ? 0 : m;
}

function max(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m === -Infinity ? 0 : m;
}

/** Перцентиль по линейной интерполяции (numpy.percentile default). */
function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** Массив квантилей сразу: [q1, q2, ...]. */
function quantiles(arr, qs) {
  return qs.map((q) => quantile(arr, q));
}

/** Pearson correlation между двумя массивами одинаковой длины. */
function corrcoef(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx2 += a * a;
    dy2 += b * b;
  }
  const den = Math.sqrt(dx2 * dy2);
  if (den === 0) return 0;
  return num / den;
}

/**
 * Гистограмма с равными бинами в диапазоне [min(x), max(x)].
 * Возвращает {counts, edges, binWidth, total}. Density-нормализованных
 * вариантов не делаем — счётчики достаточны.
 */
function histogram(arr, nBins) {
  if (!arr || arr.length === 0 || nBins < 1) {
    return { counts: [], edges: [], binWidth: 0, total: 0 };
  }
  const lo = min(arr);
  const hi = max(arr);
  const range = hi - lo;
  if (range === 0) {
    const c = new Array(nBins).fill(0);
    c[0] = arr.length;
    const edges = [];
    for (let i = 0; i <= nBins; i++) edges.push(lo + i);
    return { counts: c, edges, binWidth: 1, total: arr.length };
  }
  const binWidth = range / nBins;
  const counts = new Array(nBins).fill(0);
  for (let i = 0; i < arr.length; i++) {
    let idx = Math.floor((arr[i] - lo) / binWidth);
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const edges = [];
  for (let i = 0; i <= nBins; i++) edges.push(lo + i * binWidth);
  return { counts, edges, binWidth, total: arr.length };
}

/**
 * Shannon entropy для массива вероятностей (нулевые игнорируются).
 * Возвращает в БИТАХ (log2).
 */
function shannonEntropy(probs) {
  let h = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Нормализованная энтропия гистограммы: H / log2(nBins).
 * Возвращает значение в [0, 1].
 */
function normalizedHistogramEntropy(arr, nBins = 20) {
  if (!arr || arr.length < 2) return 0;
  const { counts, total } = histogram(arr, nBins);
  if (total === 0) return 0;
  const probs = counts.map((c) => (c + 1e-9) / (total + 1e-9 * nBins));
  const h = shannonEntropy(probs);
  const hMax = Math.log2(nBins);
  if (hMax === 0) return 0;
  return Math.max(0, Math.min(1, h / hMax));
}

/** Безопасное деление a/b с заменой на fallback при b≈0. */
function safeDiv(a, b, fallback = 0) {
  if (!isFinite(b) || Math.abs(b) < 1e-12) return fallback;
  return a / b;
}

/** Clamp(x, lo, hi). */
function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/** Z-score normalization. */
function zscore(arr) {
  const m = mean(arr);
  const s = std(arr);
  if (s < 1e-12) return arr.map(() => 0);
  return arr.map((v) => (v - m) / s);
}

/** Линейная регрессия (slope, intercept, R). */
function linregress(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: 0, r: 0 };
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let den = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    den += dx * dx;
    dy2 += dy * dy;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const r = den * dy2 === 0 ? 0 : num / Math.sqrt(den * dy2);
  return { slope, intercept, r };
}

/** Авто-корреляция на лаге k. */
function autocorr(arr, k) {
  if (!arr || arr.length <= k || k < 1) return 0;
  const a = arr.slice(0, arr.length - k);
  const b = arr.slice(k);
  return corrcoef(a, b);
}

/** Среднее модулей автокорреляций на лагах 1..maxLag (или N/2). */
function meanAbsAutocorr(arr, maxLag) {
  if (!arr || arr.length < 3) return 0;
  const lim = Math.min(maxLag || 9, Math.floor(arr.length / 2));
  if (lim < 1) return 0;
  let s = 0;
  let cnt = 0;
  for (let k = 1; k <= lim; k++) {
    const c = autocorr(arr, k);
    if (isFinite(c)) {
      s += Math.abs(c);
      cnt++;
    }
  }
  return cnt === 0 ? 0 : s / cnt;
}

module.exports = {
  mean,
  variance,
  std,
  sum,
  min,
  max,
  quantile,
  quantiles,
  corrcoef,
  histogram,
  shannonEntropy,
  normalizedHistogramEntropy,
  safeDiv,
  clamp,
  zscore,
  linregress,
  autocorr,
  meanAbsAutocorr,
};
