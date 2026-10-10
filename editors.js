/* Crop coordinates are always measured against the original image. */
(() => {
  const dialog = $('#cropDialog'), cropCanvas = $('#cropCanvas'), context = cropCanvas.getContext('2d');
  let draft, drag = null;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function normalize(rect) {
    const x = clamp(Math.round(rect.x), 0, state.image.width - 1), y = clamp(Math.round(rect.y), 0, state.image.height - 1);
    return {x, y, width: clamp(Math.round(rect.width), 1, state.image.width - x), height: clamp(Math.round(rect.height), 1, state.image.height - y)};
  }
  function draw(syncFields = true) {
    const scale = cropCanvas.width / state.image.width;
    context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    context.drawImage(state.image, 0, 0, cropCanvas.width, cropCanvas.height);
    const x = draft.x * scale, y = draft.y * scale, w = draft.width * scale, h = draft.height * scale;
    context.fillStyle = '#17191699';
    context.fillRect(0, 0, cropCanvas.width, y); context.fillRect(0, y + h, cropCanvas.width, cropCanvas.height - y - h);
    context.fillRect(0, y, x, h); context.fillRect(x + w, y, cropCanvas.width - x - w, h);
    context.strokeStyle = '#fff'; context.lineWidth = 2; context.strokeRect(x, y, w, h);
    context.strokeStyle = '#ffffff66'; context.lineWidth = 1; context.beginPath();
    for (let n = 1; n < 3; n++) { context.moveTo(x + w*n/3, y); context.lineTo(x + w*n/3, y+h); context.moveTo(x,y+h*n/3); context.lineTo(x+w,y+h*n/3); }
    context.stroke(); context.fillStyle = '#e8795c'; context.fillRect(x+w-7, y+h-7, 14, 14);
    if (syncFields) for (const [id, key] of [['cropX','x'],['cropY','y'],['cropW','width'],['cropH','height']]) $('#'+id).value = draft[key];
    $('#cropSummary').textContent = `选区 ${draft.width} × ${draft.height} 像素 · 左上角 (${draft.x}, ${draft.y})`;
  }
  $('#cropImage').onclick = () => {
    if (!state.image) return;
    if (timer) { clearTimeout(timer); timer = null; processImage(); }
    draft = {...(state.crop || {x:0, y:0, width:state.image.width, height:state.image.height})};
    const scale = Math.min(1, 760 / state.image.width, 440 / state.image.height);
    cropCanvas.width = Math.max(1, Math.round(state.image.width * scale)); cropCanvas.height = Math.max(1, Math.round(state.image.height * scale));
    dialog.showModal(); draw();
  };
  function point(e) {
    const rect = cropCanvas.getBoundingClientRect();
    return {x:clamp((e.clientX-rect.left)/rect.width*state.image.width,0,state.image.width), y:clamp((e.clientY-rect.top)/rect.height*state.image.height,0,state.image.height)};
  }
  cropCanvas.onpointerdown = e => {
    if (e.button !== 0 || drag) return;
    const p = point(e), tolerance = 14 * state.image.width / cropCanvas.getBoundingClientRect().width;
    const resize = Math.abs(p.x-draft.x-draft.width)<tolerance && Math.abs(p.y-draft.y-draft.height)<tolerance;
    const full = draft.width === state.image.width && draft.height === state.image.height;
    const inside = !full && p.x>=draft.x && p.x<=draft.x+draft.width && p.y>=draft.y && p.y<=draft.y+draft.height;
    drag = {id:e.pointerId, start:p, before:{...draft}, mode:resize?'resize':inside&&!e.shiftKey?'move':'new'};
    cropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
  };
  cropCanvas.onpointermove = e => {
    if (!drag || drag.id !== e.pointerId) return;
    const p = point(e), b = drag.before, dx = p.x-drag.start.x, dy = p.y-drag.start.y;
    if (drag.mode === 'move') draft = normalize({...b, x:clamp(b.x+dx,0,state.image.width-b.width), y:clamp(b.y+dy,0,state.image.height-b.height)});
    else if (drag.mode === 'resize') draft = normalize({...b, width:b.width+dx, height:b.height+dy});
    else draft = normalize({x:Math.min(p.x,drag.start.x), y:Math.min(p.y,drag.start.y), width:Math.abs(p.x-drag.start.x), height:Math.abs(p.y-drag.start.y)});
    draw();
  };
  cropCanvas.onpointerup = e => { if (drag?.id === e.pointerId) { drag = null; cropCanvas.releasePointerCapture(e.pointerId); } };
  cropCanvas.onpointercancel = () => { if (drag) { draft = drag.before; drag = null; draw(); } };
  cropCanvas.onlostpointercapture = () => { drag = null; };
  for (const [id,key] of [['cropX','x'],['cropY','y'],['cropW','width'],['cropH','height']]) {
    $('#'+id).oninput = e => {
      if (Number.isFinite(e.target.valueAsNumber)) { draft = normalize({...draft,[key]:e.target.valueAsNumber}); draw(false); }
    };
    $('#'+id).onchange = () => draw();
  }
  $('#resetCrop').onclick = () => { draft = {x:0,y:0,width:state.image.width,height:state.image.height}; draw(); };
  $('#cancelCrop').onclick = () => dialog.close();
  dialog.onclose = () => { drag = null; };
  $('#applyCrop').onclick = () => { state.crop = {...draft}; dialog.close(); processImage(); };
})();

(() => {
  const dialog = $('#colorDialog');
  let target = null;
  function actions() {
    const source = $('#replaceSource').value;
    $('#removeColor').disabled = !source;
    $('#replaceColor').disabled = !source || !target || source === target;
    $('#useBrush').disabled = !state.image || !target;
    $('#undoColor').disabled = !state.undo.length;
  }
  function sources(preferred) {
    $('#replaceSource').replaceChildren();
    for (const [hex,count] of state.counts) {
      const option = document.createElement('option'); option.value = hex; option.textContent = `${code(hex)} · ${count} 颗`; $('#replaceSource').append(option);
    }
    if (state.counts.some(([hex]) => hex === preferred)) $('#replaceSource').value = preferred;
    actions();
  }
  function palette() {
    const query = $('#colorSearch').value.trim().toUpperCase();
    $('#fullPalette').replaceChildren();
    for (const color of colors.filter(c => code(c.hex).toUpperCase().includes(query) || c.hex.toUpperCase().includes(query))) {
      const button = document.createElement('button'); button.className = 'manager-color'; button.classList.toggle('selected', target === color.hex);
      button.setAttribute('aria-pressed', String(target === color.hex)); button.title = `${code(color.hex)} · ${color.hex}`;
      const swatch = document.createElement('i'); swatch.style.backgroundColor = color.hex;
      const label = document.createElement('span'); label.textContent = code(color.hex);
      button.append(swatch,label); button.onclick = () => { target = color.hex; $('#colorFeedback').textContent = `目标色号：${code(target)} · ${target}`; palette(); actions(); };
      $('#fullPalette').append(button);
    }
    if (!$('#fullPalette').children.length) $('#fullPalette').textContent = '没有匹配的色号，请换个关键词。';
  }
  $('#manageColors').onclick = () => {
    if (timer) { clearTimeout(timer); timer = null; processImage(); } target = null; $('#managerBrand').textContent = state.brand; $('#colorSearch').value = '';
    $('#colorFeedback').textContent = '请选择目标色号。'; sources(state.selected); palette(); dialog.showModal();
  };
  $('#closeColors').onclick = () => dialog.close();
  $('#colorSearch').oninput = palette; $('#replaceSource').onchange = actions;
  function replace(value) {
    const source = $('#replaceSource').value;
    if (!source || source === value) return;
    state.undo.push(state.cells.slice()); if (state.undo.length > 30) state.undo.shift();
    const count = state.cells.filter(hex => hex === source).length;
    state.cells = state.cells.map(hex => hex === source ? value : hex); state.selected = value;
    updateCounts(); drawPattern(); sources(value);
    $('#colorFeedback').textContent = value ? `已将 ${count} 颗 ${code(source)} 替换为 ${code(value)}。` : `已移除 ${count} 颗 ${code(source)}。`;
  }
  $('#replaceColor').onclick = () => { if (target) replace(target); };
  $('#removeColor').onclick = () => replace(null);
  $('#undoColor').onclick = () => {
    if (!state.undo.length) return;
    state.cells = state.undo.pop(); state.selected = null; updateCounts(); drawPattern(); sources(); $('#colorFeedback').textContent = '已撤销上一次图纸修改。';
  };
  $('#useBrush').onclick = () => {
    if (!target || !state.image) return;
    state.selected = target; $('.preview-modes [data-preview="pattern"]').click(); renderPalette(); dialog.close();
  };
})();
