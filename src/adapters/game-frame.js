export function contentFrame(canvas) {
  const sample = document.createElement('canvas');
  sample.width = 96;
  sample.height = 54;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  const dark = (index, start, stride, length) => {
    let pixels = 0;
    for (let step = 0; step < length; step++) {
      const p = 4 * (index * start + step * stride);
      if (Math.max(data[p], data[p + 1], data[p + 2]) <= 19) pixels++;
    }
    return pixels >= length * 0.98;
  };
  function bounds(length, strip) {
    let first = 0, last = length - 1;
    while (first < length && strip(first)) first++;
    while (last >= 0 && strip(last)) last--;
    if (first < 2) first = 0;
    if (length - 1 - last < 2) last = length - 1;
    return last - first + 1 >= length * 0.68 ? [first / length, (last + 1) / length] : [0, 1];
  }
  const [left, right] = bounds(sample.width, x => dark(x, 1, sample.width, sample.height));
  const [top, bottom] = bounds(sample.height, y => dark(y, sample.width, 1, sample.width));
  if (left === 0 && right === 1 && top === 0 && bottom === 1) return canvas;
  const content = document.createElement('canvas');
  const width = canvas.width * (right - left), height = canvas.height * (bottom - top);
  content.width = Math.round(width);
  content.height = Math.round(height);
  content.getContext('2d').drawImage(canvas, left * canvas.width, top * canvas.height, width, height,
    0, 0, content.width, content.height);
  return content;
}
