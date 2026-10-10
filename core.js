/* Independently implemented conversion rules; source analysis: docs/analysis.md. */
(() => {
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
  const distance = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  function nearest(color, palette) {
    const white = palette.find(p => p.hex === '#FEFFFF');
    if (white && Math.min(...color) >= 248 && Math.max(...color) - Math.min(...color) <= 3) return white;
    let best = palette[0], score = Infinity;
    for (const p of palette) { const d = distance(color, p.rgb); if (d < score) { score = d; best = p; } if (d === 0) break; }
    return best;
  }
  function sample(data, width, height, cols, rows, mode) {
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const x0 = Math.floor(x * width / cols), x1 = Math.min(width, Math.ceil((x + 1) * width / cols));
      const y0 = Math.floor(y * height / rows), y1 = Math.min(height, Math.ceil((y + 1) * height / rows));
      let n = 0, sum = [0, 0, 0], winner = null, best = 0;
      const counts = new Map();
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * width + sx) * 4; if (data[i + 3] < 128) continue;
        const c = [data[i], data[i + 1], data[i + 2]]; n++;
        if (mode === 'average') sum = sum.map((v, k) => v + c[k]);
        else { const key = c.join(','), count = (counts.get(key) || 0) + 1; counts.set(key, count); if (count > best) { best = count; winner = c; } }
      }
      cells.push(n ? (mode === 'average' ? sum.map(v => Math.round(v / n)) : winner) : null);
    }
    return cells;
  }
  function count(cells) {
    const counts = new Map(); for (const c of cells) if (c) counts.set(c, (counts.get(c) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }
  function quantize(samples, cols, palette, limit = 0, dither = false, threshold = 0) {
    let cells = samples.map(c => c ? nearest(c, palette).hex : null);
    const lookup = new Map(palette.map(p => [p.hex, p]));
    if (threshold > 0) {
      const sorted = count(cells).map(c => c[0]), replacements = new Map();
      for (let i = 0; i < sorted.length; i++) {
        if (replacements.has(sorted[i])) continue;
        for (let j = i + 1; j < sorted.length; j++) {
          if (!replacements.has(sorted[j]) && distance(lookup.get(sorted[i]).rgb, lookup.get(sorted[j]).rgb) < threshold ** 2) replacements.set(sorted[j], sorted[i]);
        }
      }
      cells = cells.map(c => replacements.get(c) || c);
    }
    const colors = count(cells);
    const chosen = limit && colors.length > limit ? colors.slice(0, limit).map(([hex]) => lookup.get(hex)) : null;
    if (!chosen && !dither) return cells;
    const active = chosen || colors.map(([hex]) => lookup.get(hex)); if (!active.length) return cells;
    if (!dither) return cells.map(c => c ? nearest(lookup.get(c).rgb, active).hex : null);
    const work = samples.map(c => c && [...c]);
    return work.map((c, i) => {
      if (!c) return null;
      const match = nearest(c, active), err = c.map((v, k) => v - match.rgb[k]), x = i % cols;
      for (const [dx, dy, factor] of [[1, 0, 7/16], [-1, 1, 3/16], [0, 1, 5/16], [1, 1, 1/16]]) {
        const nx = x + dx, next = i + dy * cols + dx;
        if (nx >= 0 && nx < cols && next < work.length && work[next]) work[next] = work[next].map((v, k) => Math.max(0, Math.min(255, v + err[k] * factor)));
      }
      return match.hex;
    });
  }
  function removeBackground(cells, cols, tolerance = 30) {
    const rows = cells.length / cols, edge = [];
    for (let x = 0; x < cols; x++) edge.push(x, (rows - 1) * cols + x);
    for (let y = 1; y < rows - 1; y++) edge.push(y * cols, y * cols + cols - 1);
    const dominant = count(edge.map(i => cells[i]))[0];
    if (!dominant || dominant[1] < edge.length / 4) return cells.slice();
    const target = rgb(dominant[0]), out = cells.slice(), visited = new Set(), stack = edge.slice();
    while (stack.length) {
      const i = stack.pop(); if (visited.has(i)) continue; visited.add(i);
      if (out[i] === null) continue;
      if (out[i] && distance(rgb(out[i]), target) > tolerance ** 2) continue;
      out[i] = null; const x = i % cols;
      if (x > 0) stack.push(i - 1); if (x < cols - 1) stack.push(i + 1);
      if (i >= cols) stack.push(i - cols); if (i + cols < out.length) stack.push(i + cols);
    }
    return out;
  }
  // Virtual frame: cover crops the source; contain adds transparent margins.
  function fitRegion(region, ratio, fit) {
    let {x: sx, y: sy, width: sw, height: sh} = region;
    if (fit === 'cover') {
      if (sw / sh > ratio) { const w = sh * ratio; sx += (sw - w) / 2; sw = w; }
      else { const h = sw / ratio; sy += (sh - h) / 2; sh = h; }
      return {sx, sy, sw, sh, width: sw, height: sh, dx: 0, dy: 0};
    }
    const width = Math.max(sw, sh * ratio), height = width / ratio;
    return {sx, sy, sw, sh, width, height, dx: (width - sw) / 2, dy: (height - sh) / 2};
  }
  const api = { rgb, distance, nearest, sample, count, quantize, removeBackground, fitRegion };
  if (typeof module !== 'undefined') module.exports = api; else window.BeadCore = api;
})();
