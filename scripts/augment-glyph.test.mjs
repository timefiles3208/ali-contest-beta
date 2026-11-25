import assert from 'node:assert/strict';
import test from 'node:test';
import { glyphSignature, matchAugmentGlyph, selectedAugmentTiles } from '../src/engine/augment-glyph.js';

function picture(width, height, base = [28,28,28]) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (left, top, w, h, rgb) => {
    for (let y=top;y<top+h;y++) for (let x=left;x<left+w;x++) data.set([...rgb,255], (y*width+x)*4);
  };
  paint(0,0,width,height,base);
  return {data,width,height,paint};
}
function sample(size, offset = 0) {
  const img = picture(size,size);
  const side = size - 12, pos = 6 + offset;
  img.paint(pos, pos, side, 3, [240,201,30]);
  img.paint(pos, pos, 3, side, [240,201,30]);
  img.paint(pos, pos + side - 3, Math.round(side*.68), 3, [240,201,30]);
  return img;
}

test('glyphs are compared by normalized shape and equal artwork is left unresolved', () => {
  const a = glyphSignature(sample(32));
  const shifted = glyphSignature(sample(34,1));
  assert.equal(matchAugmentGlyph(shifted, [{ id:'hex-a', ...a }]), 'hex-a');
  assert.equal(matchAugmentGlyph(a, [{ id:'hex-a', ...a },{ id:'hex-b', ...a }]), null);
  assert.equal(glyphSignature(picture(32,32)), null);
});

test('desktop scouting locates dark square cells in the opponent banner only', () => {
  const frame = picture(960,540,[105,160,110]);
  frame.paint(682,134,38,19,[28,28,28]);
  frame.paint(690,138,6,9,[240,201,30]);
  frame.paint(708,138,6,9,[190,205,237]);
  frame.paint(245,117,19,19,[28,28,28]);
  assert.deepEqual(selectedAugmentTiles(frame), [
    {x:682,y:134,size:19},{x:701,y:134,size:19},
  ]);
});
