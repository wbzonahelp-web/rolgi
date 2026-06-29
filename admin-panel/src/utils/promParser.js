/**
 * Prometheus text exposition format parser
 * Returns: Map<metricName, { type, help, samples: Array<{labels, value}> }>
 */
export function parsePrometheus(text) {
  const out = new Map();
  if (!text || typeof text !== 'string') return out;
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('# HELP')) {
      const m = line.match(/^# HELP (\S+) (.*)$/);
      if (m) {
        const [, name, help] = m;
        const cur = out.get(name) || { type: 'untyped', help: '', samples: [] };
        cur.help = help;
        out.set(name, cur);
      }
      continue;
    }
    if (line.startsWith('# TYPE')) {
      const m = line.match(/^# TYPE (\S+) (\S+)$/);
      if (m) {
        const [, name, type] = m;
        const cur = out.get(name) || { type: 'untyped', help: '', samples: [] };
        cur.type = type;
        out.set(name, cur);
      }
      continue;
    }
    if (line.startsWith('#')) continue;

    // sample: name{labels} value [timestamp]
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(.+)$/);
    if (!m) continue;
    const [, name, , labelsStr, valStr] = m;
    const value = parseFloat(valStr);
    if (Number.isNaN(value)) continue;
    const labels = {};
    if (labelsStr) {
      // labels: k="v",k2="v2"
      const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
      let lm;
      while ((lm = re.exec(labelsStr)) !== null) {
        labels[lm[1]] = lm[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
      }
    }
    const cur = out.get(name) || { type: 'untyped', help: '', samples: [] };
    cur.samples.push({ labels, value });
    out.set(name, cur);
  }
  return out;
}

/** Берём первый sample без лейблов (или с любыми) */
export function getSingle(metrics, name) {
  const m = metrics.get(name);
  if (!m || !m.samples.length) return null;
  return m.samples[0].value;
}

/** Сумма по всем sample'ам метрики */
export function sumAll(metrics, name) {
  const m = metrics.get(name);
  if (!m) return 0;
  return m.samples.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
}

/** Группировка sample'ов по значению лейбла */
export function groupByLabel(metrics, name, labelKey) {
  const m = metrics.get(name);
  const out = {};
  if (!m) return out;
  for (const s of m.samples) {
    const k = s.labels?.[labelKey] ?? '_';
    out[k] = (out[k] || 0) + (Number(s.value) || 0);
  }
  return out;
}

/** Получить значение по конкретным лейблам (точное совпадение всех ключей) */
export function getByLabels(metrics, name, wantLabels) {
  const m = metrics.get(name);
  if (!m) return null;
  for (const s of m.samples) {
    const ok = Object.entries(wantLabels).every(([k, v]) => String(s.labels?.[k]) === String(v));
    if (ok) return s.value;
  }
  return null;
}

/** Форматтеры */
export function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
}
export function fmtMs(sec) {
  if (sec == null || isNaN(sec)) return '—';
  if (sec < 0.001) return `${(sec * 1e6).toFixed(0)} µs`;
  if (sec < 1) return `${(sec * 1000).toFixed(2)} ms`;
  return `${sec.toFixed(2)} s`;
}
export function fmtNumber(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU');
}
export function fmtUptime(startTs) {
  if (!startTs) return '—';
  const sec = Math.floor(Date.now() / 1000 - startTs);
  if (sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}
