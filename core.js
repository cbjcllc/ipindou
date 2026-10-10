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
  function parseCsv(text) {
    const rows = [], row = []; let cell = '', quoted = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row.slice()); row.length = 0; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row.slice()); }
    return rows;
  }
  function parseCsvGrid(text, palette = [], brand = '') {
    const rows = parseCsv(text);
    const clean = value => String(value ?? '').trim();
    const asHex = value => {
      const token = clean(value); if (!token) return {valid: true, value: null};
      const match = token.match(/^#?([a-f\d]{6}|[a-f\d]{3})$/i);
      if (match) { const hex = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1]; return {valid: true, value: `#${hex.toUpperCase()}`}; }
      const found = palette.find(item => Object.values(item.codes || {}).some(code => String(code).toUpperCase() === token.toUpperCase()));
      return found ? {valid: true, value: found.hex} : {valid: false, value: null};
    };
    const dimensionRow = rows.find(row => row[0] && /图纸尺寸|size|dimension/i.test(row[0]));
    const dimensionText = dimensionRow ? dimensionRow.slice(1).join(' ') : '';
    const dimension = dimensionText.match(/(\d+)\s*[×x*]\s*(\d+)/i);
    const sourceBrand = rows.find(row => row[0] && /^(色板|palette|brand)$/i.test(clean(row[0])))?.[1];
    const marker = rows.findIndex(row => row.some(cell => /逐格|grid|cells|pattern/i.test(clean(cell))));
    let gridRows = marker >= 0 ? rows.slice(marker + 1) : [];
    if (marker < 0) {
      const first = rows.findIndex(row => row.some(cell => asHex(cell).valid && clean(cell)));
      if (first < 0 && !dimension) throw new Error('CSV 中没有找到色号网格。请使用 #RRGGBB 格式。');
      gridRows = first < 0 ? rows.slice(-Number(dimension[2])) : rows.slice(first);
    }
    const parsedRows = gridRows.map(row => row.map(asHex));
    const invalid = parsedRows.flat().find(item => !item.valid);
    if (invalid) throw new Error('CSV 包含无法识别的颜色，请使用 #RRGGBB 格式。');
    let height = dimension ? Number(dimension[2]) : parsedRows.length;
    let width = dimension ? Number(dimension[1]) : Math.max(0, ...parsedRows.map(row => row.length));
    if (!width || !height || width > 500 || height > 500) throw new Error('CSV 图纸尺寸无效，宽高需为 1–500 格。');
    if (parsedRows.length > height) gridRows = parsedRows.slice(-height); else gridRows = parsedRows;
    const cells = Array.from({length: width * height}, (_, i) => gridRows[Math.floor(i / width)]?.[i % width]?.value || null);
    return {cols: width, rows: height, cells, brand: sourceBrand || brand};
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
  const api = { rgb, distance, nearest, sample, count, quantize, removeBackground, parseCsv, parseCsvGrid, fitRegion };
  if (typeof module !== 'undefined') module.exports = api; else window.BeadCore = api;
})();
