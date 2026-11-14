// Khối bố cục: vị trí tương đối của một nhánh cây kèm đường bao theo từng đời,
// để ép hai nhánh kề nhau sát lại mà không chồng lên nhau ở bất kỳ đời nào.
//   positions: id người -> { x, generation }
//   refs:      "familyId:personId" -> { familyId, personId, x, generation } (thẻ tham chiếu)
//   contour:   đời -> { min, max } theo trục ngang

export function emptyBlock() {
  return { positions: new Map(), refs: new Map(), contour: new Map() };
}

export function extendContour(contour, generation, minX, maxX) {
  const current = contour.get(generation);
  if (!current) contour.set(generation, { min: minX, max: maxX });
  else contour.set(generation, { min: Math.min(current.min, minX), max: Math.max(current.max, maxX) });
}

export function shiftBlock(block, dx) {
  if (!dx) return block;
  const shifted = emptyBlock();
  block.positions.forEach((item, id) => shifted.positions.set(id, { ...item, x: item.x + dx }));
  block.refs.forEach((item, key) => shifted.refs.set(key, { ...item, x: item.x + dx }));
  block.contour.forEach((range, generation) => shifted.contour.set(generation, { min: range.min + dx, max: range.max + dx }));
  return shifted;
}

export function mergeInto(target, source) {
  source.positions.forEach((item, id) => target.positions.set(id, item));
  source.refs.forEach((item, key) => target.refs.set(key, item));
  source.contour.forEach((range, generation) => extendContour(target.contour, generation, range.min, range.max));
  return target;
}

export function blockSpan(block) {
  let min = Infinity;
  let max = -Infinity;
  block.contour.forEach((range) => {
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  });
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

// Độ dịch nhỏ nhất để `next` nằm bên phải `placed` ở mọi đời chung, cách nhau `gap`.
export function minimalShift(placed, next, gap) {
  let shift = -Infinity;
  next.contour.forEach((range, generation) => {
    const other = placed.contour.get(generation);
    if (other) shift = Math.max(shift, other.max + gap - range.min);
  });
  if (shift === -Infinity) {
    const placedSpan = blockSpan(placed);
    const nextSpan = blockSpan(next);
    return placed.contour.size ? placedSpan.max + gap - nextSpan.min : 0;
  }
  return shift;
}

// Khoảng ngang của hàng trên cùng (đời nhỏ nhất) của khối.
export function topSpan(block) {
  const generations = [...block.contour.keys()];
  if (!generations.length) return { min: 0, max: 0 };
  return block.contour.get(Math.min(...generations));
}

// Xếp các khối từ trái sang phải, mỗi khối sát khối trước tới mức cho phép.
export function packSequential(blocks, gap) {
  const result = emptyBlock();
  blocks.forEach((block, index) => {
    const dx = index === 0 ? 0 : minimalShift(result, block, gap);
    mergeInto(result, shiftBlock(block, dx));
  });
  return result;
}
