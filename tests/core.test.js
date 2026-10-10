const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('palette-data.js', 'utf8') + ';window.data=COLOR_MAPPING;', sandbox);
const mapping = sandbox.window.data;
const palette = Object.entries(mapping).map(([hex, codes]) => ({ hex, codes, rgb: core.rgb(hex) }));
assert.equal(Object.keys(mapping).length, 291);
for (const hex of Object.keys(mapping)) {
  for (const brand of ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']) assert.ok(mapping[hex][brand], `${hex} maps to ${brand}`);
}

const rgba = Uint8ClampedArray.from([
  255,255,255,255, 255,255,255,255,
  0,0,0,255,       255,255,255,0,
]);
assert.deepEqual(core.sample(rgba, 2, 2, 1, 1, 'dominant'), [[255,255,255]]);
assert.deepEqual(core.sample(rgba, 2, 2, 1, 1, 'average'), [[170,170,170]]);
assert.equal(core.nearest([250,244,200], palette).hex, '#FAF4C8');
assert.equal(new Set(core.quantize([[250,244,200],[0,0,0],[250,244,200]], 3, palette, 1)).size, 1);

const background = '#FAF4C8', subject = '#FE8B4C';
const cells = [background,background,background,background,subject,background,background,background,background];
const cleared = core.removeBackground(cells, 3);
assert.equal(cleared[0], null);
assert.equal(cleared[4], subject);
const withTransparent = [background,background,background,background,null,background,background,background,background];
assert.deepEqual(core.removeBackground(withTransparent, 3), Array(9).fill(null));
console.log('PASS: 291 colors map to five brands; dominant/average sampling, alpha handling, RGB matching, color limits, and edge background removal.');

// Cropping respects the selected original-image offset and never stretches photos.
assert.deepEqual(core.fitRegion({x:20,y:30,width:200,height:100},1,'cover'),
  {sx:70,sy:30,sw:100,sh:100,width:100,height:100,dx:0,dy:0});
assert.deepEqual(core.fitRegion({x:20,y:30,width:100,height:200},2,'cover'),
  {sx:20,sy:105,sw:100,sh:50,width:100,height:50,dx:0,dy:0});
assert.deepEqual(core.fitRegion({x:20,y:30,width:200,height:100},1,'contain'),
  {sx:20,sy:30,sw:200,sh:100,width:200,height:200,dx:0,dy:50});
for (const ratio of [1/300, 60/72, 1, 300]) for (const fit of ['cover','contain']) {
  const region = {x:7,y:19,width:150,height:97};
  const frame = core.fitRegion(region,ratio,fit);
  assert.ok(Math.abs(frame.width/frame.height-ratio)<1e-8);
  assert.ok(frame.sx>=region.x && frame.sy>=region.y);
  assert.ok(frame.sx+frame.sw<=region.x+region.width+1e-8);
  assert.ok(frame.sy+frame.sh<=region.y+region.height+1e-8);
  assert.ok(frame.dx>=0 && frame.dy>=0);
}
