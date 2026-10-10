const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const core = window.BeadCore;
const colors = Object.entries(COLOR_MAPPING).map(([hex, codes]) => ({hex, codes, rgb: core.rgb(hex)}));
const colorMap = new Map(colors.map(c => [c.hex, c]));
const state = {image: null, name: '', brand: 'MARD', grid: 48, fit: 'contain', limit: 18,
  mode: 'dominant', merge: 0, dither: false, background: false, labels: true, showGrid: true,
  zoom: 1, selected: null, cells: [], cols: 0, rows: 0, counts: [], undo: [], fileUrl: null,
  preview: 'pattern', ironStrength: 45, sizeMode: 'ratio', customCols: 48, customRows: 48};
const canvas = $('#patternCanvas'), ctx = canvas.getContext('2d');
$('#loadDemo').onclick = () => {
  const image = new Image();
  image.onload = () => {
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.fileUrl = null; state.image = image; state.name = '三色示例';
    $('#fileName').textContent = state.name; $('#fileThumb').style.backgroundImage = 'url("tests/sample.png")';
    $('#fileInfo').classList.remove('hidden'); $('#emptyState').classList.add('hidden'); canvas.classList.remove('hidden'); processImage();
  };
  image.src = 'tests/sample.png';
};
function code(hex) { return hex ? colorMap.get(hex).codes[state.brand] : ''; }
function status(message) { $('#statusMessage').textContent = message; }
function chooseFile() { $('#fileInput').click(); }
$('#uploadZone').onclick = $('#emptyUpload').onclick = chooseFile;
$('#fileInput').onchange = e => { if (e.target.files[0]) loadImage(e.target.files[0]); e.target.value = ''; };
$('#uploadZone').ondragover = e => { e.preventDefault(); $('#uploadZone').classList.add('dragging'); };
$('#uploadZone').ondragleave = () => $('#uploadZone').classList.remove('dragging');
$('#uploadZone').ondrop = e => { e.preventDefault(); $('#uploadZone').classList.remove('dragging'); if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]); };
function loadImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return status('请选择 PNG、JPG 或 WEBP 图片。');
  if (file.size > 30 * 1024 * 1024) return status('图片超过 30 MB，请先缩小文件。');
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {
    if (image.width * image.height > 40000000) { URL.revokeObjectURL(url); return status('图片超过 4000 万像素，请先缩小尺寸。'); }
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.fileUrl = url; state.image = image; state.name = file.name;
    $('#fileName').textContent = file.name;
    $('#fileThumb').style.backgroundImage = `url("${url}")`;
    $('#fileInfo').classList.remove('hidden'); $('#emptyState').classList.add('hidden');
    canvas.classList.remove('hidden'); processImage();
  };
  image.onerror = () => { URL.revokeObjectURL(url); status('无法读取这张图片，请尝试其他图片。'); };
  image.src = url;
}
$('#removeImage').onclick = () => {
  clearExports();
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.image = null; state.cells = []; state.undo = []; state.selected = null; state.counts = [];
  canvas.classList.add('hidden'); $('#emptyState').classList.remove('hidden'); $('#fileInfo').classList.add('hidden');
  $('#canvasStatus').textContent = '等待一张图片'; $('#dimensions').textContent = '— × —';
  $('#totalCount').textContent = $('#usedColors').textContent = $('#sizeStat').textContent = '—';
  $('#clearSelection').classList.add('hidden'); $('#pngExport').disabled = $('#ironExport').disabled = $('#csvExport').disabled = $('#undoEdit').disabled = true;
  $('#colorList').innerHTML = '<div class="palette-empty">上传图片后，这里会列出每种拼豆的色号和数量。</div>'; status('');
};
let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(processImage, 120); }
$('#widthRange').oninput = e => {
  state.grid = +e.target.value; $('#widthValue').textContent = state.grid;
  const percent = (state.grid - 10) / 290 * 100;
  e.target.style.background = `linear-gradient(90deg,var(--coral) ${percent}%,#ebe6df ${percent}%)`; schedule();
};
$('#gridSizeSelect').onchange = e => {
  state.sizeMode = e.target.value;
  const custom = state.sizeMode === 'custom', ratio = state.sizeMode === 'ratio';
  $('#customSizeFields').classList.toggle('hidden', !custom);
  $('#ratioWidthLabel').classList.toggle('hidden', !ratio);
  $('#widthRange').classList.toggle('hidden', !ratio);
  $('#ratioWidthEnds').classList.toggle('hidden', !ratio);
  if (state.image) processImage();
};
$('#customCols').onchange = $('#customRows').onchange = e => {
  const value = Math.max(1, Math.min(300, Math.round(+e.target.value || 1)));
  e.target.value = value;
  state.customCols = +$('#customCols').value; state.customRows = +$('#customRows').value;
  if (state.sizeMode === 'custom' && state.image) processImage();
};
$('#colorLimit').onchange = e => { state.limit = +e.target.value; processImage(); };
$('#modeSelect').onchange = e => { state.mode = e.target.value; processImage(); };
$('#mergeRange').oninput = e => { state.merge = +e.target.value; $('#mergeValue').textContent = state.merge; schedule(); };
$('#ditherToggle').onchange = e => { state.dither = e.target.checked; processImage(); };
$('#backgroundToggle').onchange = e => { state.background = e.target.checked; processImage(); };
$('#labelsToggle').onchange = e => { state.labels = e.target.checked; drawPattern(); };
$$('.preview-modes [data-preview]').forEach(button => button.onclick = () => {
  state.preview = button.dataset.preview;
  $$('.preview-modes [data-preview]').forEach(b => b.classList.toggle('active', b === button));
  $('#ironStrengthControl').classList.toggle('hidden', state.preview !== 'ironed');
  $('#undoEdit').disabled = state.preview === 'ironed' || !state.undo.length;
  drawPattern();
});
$('#ironStrength').oninput = e => { state.ironStrength = +e.target.value; $('#ironStrengthValue').textContent = `${state.ironStrength}%`; drawPattern(); };
$$('#orientation button').forEach(button => button.onclick = () => {
  $$('#orientation button').forEach(b => b.classList.toggle('active', b === button));
  state.fit = button.dataset.fit; processImage();
});
$$('.brand-choice').forEach(button => button.onclick = () => {
  $$('.brand-choice').forEach(b => b.classList.toggle('active', b === button));
  state.brand = button.dataset.brand; $('#paletteBrand').textContent = state.brand;
  if (state.image) { updateCounts(); drawPattern(); }
});
$('#gridToggle').onclick = () => { state.showGrid = !state.showGrid; $('#gridToggle').classList.toggle('active', state.showGrid); drawPattern(); };
function zoom(delta) { state.zoom = Math.max(.5, Math.min(5, state.zoom + delta)); $('#zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`; drawPattern(); }
$('#zoomIn').onclick = () => zoom(.5); $('#zoomOut').onclick = () => zoom(-.5);
$('#clearSelection').onclick = () => { state.selected = null; renderPalette(); };
$('#eraseEdit').onclick = () => { state.selected = state.selected === 'erase' ? null : 'erase'; renderPalette(); };
$('#undoEdit').onclick = () => { if (state.undo.length) { state.cells = state.undo.pop(); updateCounts(); drawPattern(); } };
function processImage() {
  if (!state.image) return;
  status('正在生成…');
  try {
    const image = state.image;
    let cols = state.sizeMode === 'ratio' ? state.grid : state.sizeMode === 'custom' ? state.customCols : +state.sizeMode;
    let rows = state.sizeMode === 'ratio' ? Math.max(1, Math.round(cols * (state.fit === 'cover' ? 1 : image.height / image.width))) : state.sizeMode === 'custom' ? state.customRows : +state.sizeMode;
    if (state.sizeMode === 'ratio' && rows > 300) { cols = Math.max(1, Math.round(cols * 300 / rows)); rows = 300; }
    const targetRatio = cols / rows, imageRatio = image.width / image.height;
    const crop = state.fit === 'cover';
    let sx = 0, sy = 0, sourceW = image.width, sourceH = image.height;
    if (crop && imageRatio > targetRatio) { sourceW = image.height * targetRatio; sx = (image.width - sourceW) / 2; }
    else if (crop && imageRatio < targetRatio) { sourceH = image.width / targetRatio; sy = (image.height - sourceH) / 2; }
    const factor = Math.min(1, 2048 / Math.max(sourceW, sourceH));
    const source = document.createElement('canvas');
    source.width = Math.max(cols, Math.round(sourceW * factor)); source.height = Math.max(rows, Math.round(sourceH * factor));
    const context = source.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, sx, sy,
      sourceW, sourceH, 0, 0, source.width, source.height);
    const samples = core.sample(context.getImageData(0, 0, source.width, source.height).data, source.width, source.height, cols, rows, state.mode);
    let cells = core.quantize(samples, cols, colors, state.limit, state.dither, state.merge);
    if (state.background) cells = core.removeBackground(cells, cols);
    state.cols = cols; state.rows = rows; state.cells = cells; state.selected = null; state.undo = [];
    $('#canvasStatus').textContent = state.name; $('#dimensions').textContent = `${cols} × ${rows}`;
    $('#sizeStat').textContent = `${cols} × ${rows}`;
    $('#pngExport').disabled = $('#ironExport').disabled = $('#csvExport').disabled = false;
    updateCounts(); drawPattern();
    status(`已生成 ${cols} × ${rows} 格图纸。调整转换参数会重新生成并清除手动修改。`);
  } catch (error) { console.error(error); status('生成失败，请降低格数或换一张图片重试。'); }
}
function updateCounts() {
  clearExports();
  state.counts = core.count(state.cells);
  $('#totalCount').textContent = state.counts.reduce((n, item) => n + item[1], 0).toLocaleString();
  $('#usedColors').textContent = state.counts.length;
  $('#undoEdit').disabled = state.preview === 'ironed' || !state.undo.length; renderPalette();
}
function renderPalette() {
  $('#clearSelection').classList.toggle('hidden', state.selected === null);
  $('#eraseEdit').classList.toggle('active', state.selected === 'erase');
  $('#canvasHint').textContent = state.selected === 'erase' ? '点击格子擦除 · 支持撤销' : state.selected ? `当前画笔 ${code(state.selected)} · 点击格子改色` : '选中颜色后点击图纸可改色 · 透明格不计数';
  $('#colorList').replaceChildren();
  if (!state.counts.length) { $('#colorList').textContent = state.image ? '没有非透明拼豆。可关闭去背景后重试。' : ''; return; }
  for (const [hex, count] of state.counts) {
    const button = document.createElement('button'); button.className = 'color-chip'; button.classList.toggle('selected', state.selected === hex);
    button.dataset.hex = hex; button.title = `${code(hex)} · ${hex} · ${count} 颗`;
    const swatch = document.createElement('i'); swatch.className = 'swatch'; swatch.style.background = hex;
    const label = document.createElement('span'); label.className = 'chip-code'; label.textContent = code(hex);
    const quantity = document.createElement('span'); quantity.className = 'chip-count'; quantity.textContent = `×${count}`;
    button.append(swatch, label, quantity); button.onclick = () => { state.selected = state.selected === hex ? null : hex; renderPalette(); };
    $('#colorList').append(button);
  }
}
function contrast(hex) { const [r,g,b] = core.rgb(hex); return (r*299+g*587+b*114)/1000 > 150 ? '#34302b' : '#fff'; }
function paintGrid(context, cell, left = 0, top = 0, labels = false, grid = true) {
  for (let y = 0; y < state.rows; y++) for (let x = 0; x < state.cols; x++) {
    const hex = state.cells[y * state.cols + x];
    context.fillStyle = hex || ((x + y) % 2 ? '#f3f1eb' : '#fff');
    context.fillRect(left + x*cell, top + y*cell, cell, cell);
    if (grid) { context.strokeStyle = '#514b4338'; context.lineWidth = .5; context.strokeRect(left + x*cell, top + y*cell, cell, cell); }
    if (hex && labels) { context.fillStyle = contrast(hex); context.font = `${Math.max(7, cell * .29)}px monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(code(hex), left + x*cell + cell/2, top + y*cell + cell/2, cell - 2); }
  }
}
function paintIroned(context, cell, strength = state.ironStrength) {
  const width = state.cols * cell, height = state.rows * cell;
  for (let y = 0; y < state.rows; y++) for (let x = 0; x < state.cols; x++) {
    context.fillStyle = (x + y) % 2 ? '#f3f1eb' : '#fff';
    context.fillRect(x * cell, y * cell, cell, cell);
  }
  const beads = document.createElement('canvas'); beads.width = width; beads.height = height;
  const beadCtx = beads.getContext('2d');
  for (let y = 0; y < state.rows; y++) for (let x = 0; x < state.cols; x++) {
    const hex = state.cells[y * state.cols + x];
    if (!hex) continue;
    const cx = (x + .5) * cell, cy = (y + .5) * cell, radius = cell * .66;
    beadCtx.fillStyle = hex; beadCtx.beginPath(); beadCtx.arc(cx, cy, radius, 0, Math.PI * 2); beadCtx.fill();
  }
  const blur = cell * (.012 + strength / 100 * .17);
  context.save(); context.filter = `blur(${blur.toFixed(2)}px)`; context.drawImage(beads, 0, 0); context.restore();
  context.drawImage(beads, 0, 0);
  // A restrained highlight gives the fused surface some plastic sheen.
  context.save(); context.globalAlpha = .11; context.fillStyle = '#fff';
  for (let y = 0; y < state.rows; y++) for (let x = 0; x < state.cols; x++) {
    if (!state.cells[y * state.cols + x]) continue;
    const cx = (x + .5) * cell, cy = (y + .5) * cell;
    context.beginPath(); context.ellipse(cx - cell * .15, cy - cell * .2, cell * .18, cell * .08, -.45, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}
function drawPattern() {
  if (!state.image) return;
  const base = Math.min(1, 560 / (state.cols * 18), 430 / (state.rows * 18));
  const cell = Math.max(2, Math.round(18 * base * state.zoom));
  canvas.width = state.cols * cell; canvas.height = state.rows * cell;
  canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
  if (state.preview === 'ironed') paintIroned(ctx, cell);
  else paintGrid(ctx, cell, 0, 0, state.labels && cell >= 14, state.showGrid);
  canvas.style.cursor = state.preview === 'ironed' ? 'default' : 'crosshair';
}
canvas.onclick = e => {
  if (state.preview !== 'pattern' || state.selected === null || !state.image) return;
  const rect = canvas.getBoundingClientRect(), x = Math.floor((e.clientX-rect.left)/rect.width*state.cols), y = Math.floor((e.clientY-rect.top)/rect.height*state.rows);
  if (x < 0 || x >= state.cols || y < 0 || y >= state.rows) return;
  const value = state.selected === 'erase' ? null : state.selected, i = y * state.cols + x;
  if (state.cells[i] === value) return;
  state.undo.push(state.cells.slice()); if (state.undo.length > 30) state.undo.shift();
  state.cells[i] = value; updateCounts(); drawPattern();
};
const exportUrls = new Map();
function clearExports() {
  for (const {url, link} of exportUrls.values()) { URL.revokeObjectURL(url); link.remove(); }
  exportUrls.clear();
}
function download(blob, name) {
  if (!blob) return status('导出失败，请减少图纸格数。');
  const prior = exportUrls.get(name);
  if (prior) { URL.revokeObjectURL(prior.url); prior.link.remove(); }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.textContent = name.endsWith('.png') ? '下载已生成的 PNG 图纸' : '下载已生成的 CSV 清单';
  $('#exportLinks').append(a); exportUrls.set(name, {url, link:a}); a.click();
  status('导出文件已生成。若未自动下载，请点击图纸下方的下载链接。');
}
$('#pngExport').onclick = () => {
  if (!state.image) return;
  const out = document.createElement('canvas'), cell = 24, left = 50, top = 112;
  const width = Math.max(650, state.cols * cell + 100), legendCols = Math.floor((width - 100) / 160);
  const legendTop = top + state.rows * cell + 50;
  out.width = width; out.height = legendTop + Math.ceil(state.counts.length / legendCols) * 34 + 70;
  const context = out.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,out.width,out.height);
  context.fillStyle = '#27251f'; context.font = 'bold 24px sans-serif'; context.fillText('豆点 · 拼豆图纸', left, 36);
  context.font = '14px sans-serif'; context.fillText(`${state.brand} | ${state.cols} × ${state.rows} | ${state.counts.reduce((n,v)=>n+v[1],0)} 颗 | ${state.counts.length} 色`, left, 65);
  paintGrid(context, cell, left, top, true, true);
  context.font = '10px monospace'; context.fillStyle = '#555'; context.textAlign = 'center'; context.textBaseline = 'middle';
  for (let x = 0; x < state.cols; x++) context.fillText(String(x + 1), left+x*cell+cell/2, top-15);
  for (let y = 0; y < state.rows; y++) context.fillText(String(y + 1), left-22, top+y*cell+cell/2);
  context.strokeStyle = '#66594c'; context.lineWidth = 1.4; context.beginPath();
  for (let x=0;x<=state.cols;x+=10){context.moveTo(left+x*cell,top);context.lineTo(left+x*cell,top+state.rows*cell);}
  for (let y=0;y<=state.rows;y+=10){context.moveTo(left,top+y*cell);context.lineTo(left+state.cols*cell,top+y*cell);}
  context.stroke();
  state.counts.forEach(([hex,count],i)=>{const x=left+(i%legendCols)*160,y=legendTop+Math.floor(i/legendCols)*34;context.fillStyle=hex;context.fillRect(x,y,22,22);context.strokeStyle='#999';context.lineWidth=.5;context.strokeRect(x,y,22,22);context.fillStyle='#333';context.font='13px monospace';context.textAlign='left';context.fillText(`${code(hex)} × ${count}`,x+30,y+11);});
  context.textAlign='left';context.fillStyle='#777';context.font='12px sans-serif';context.fillText('空白棋盘格不放豆 · 色彩以实体色卡为准',left,out.height-23);
  out.toBlob(blob => download(blob,'dou-dian-pattern.png'),'image/png');
};
$('#ironExport').onclick = () => {
  if (!state.image) return;
  const cell = 32, margin = 32, header = 76;
  const out = document.createElement('canvas'); out.width = state.cols * cell + margin * 2; out.height = state.rows * cell + header + margin;
  const context = out.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, out.width, out.height);
  context.fillStyle = '#27251f'; context.font = 'bold 24px sans-serif'; context.fillText('豆点 · 烫面晕染效果', margin, 34);
  context.font = '14px sans-serif'; context.fillStyle = '#777'; context.fillText(`${state.cols} × ${state.rows} 格 | 晕染强度 ${state.ironStrength}% | 成品效果预览`, margin, 60);
  // paintIroned starts at the canvas origin; render onto a temporary layer to place it below the title.
  const preview = document.createElement('canvas'); preview.width = state.cols * cell; preview.height = state.rows * cell;
  paintIroned(preview.getContext('2d'), cell, state.ironStrength);
  context.clearRect(0, 76, out.width, out.height - 76); context.drawImage(preview, margin, header);
  out.toBlob(blob => download(blob, 'dou-dian-ironed-preview.png'), 'image/png');
};
$('#csvExport').onclick = () => {
  const rows = [['色板',state.brand],['图纸尺寸',`${state.cols} × ${state.rows}`],[],['色号','HEX','数量']];
  state.counts.forEach(([hex,count])=>rows.push([code(hex),hex,count]));
  rows.push([],['总颗数',state.counts.reduce((n,v)=>n+v[1],0)],[],['逐格色号（空格不放豆）']);
  for(let y=0;y<state.rows;y++) rows.push(state.cells.slice(y*state.cols,(y+1)*state.cols).map(code));
  const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
  download(new Blob([csv],{type:'text/csv;charset=utf-8'}),'dou-dian-pattern.csv');
};
