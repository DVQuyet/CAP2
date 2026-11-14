// Kích thước vùng vẽ: đủ chứa mọi thẻ và mọi đường nối, cộng lề.
import { CANVAS_PADDING } from "../config.js";
import { toInt } from "../geometry.js";

const MIN_CANVAS_WIDTH = 2400;
const MIN_CANVAS_HEIGHT = 1400;
const PATH_NUMBER = /-?\d+(?:\.\d+)?/g;

export function sceneCanvasSize(nodes = [], lines = []) {
  let width = MIN_CANVAS_WIDTH;
  let height = MIN_CANVAS_HEIGHT;
  nodes.forEach((node) => {
    width = Math.max(width, toInt(node.x, 0) + node.width + CANVAS_PADDING);
    height = Math.max(height, toInt(node.y, 0) + node.height + CANVAS_PADDING);
  });
  // Chuỗi `d` chỉ gồm các cặp x y (M, L, Q).
  lines.forEach((line) => {
    const numbers = String(line.d || "").match(PATH_NUMBER) || [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      width = Math.max(width, Number(numbers[index]) + CANVAS_PADDING);
      height = Math.max(height, Number(numbers[index + 1]) + CANVAS_PADDING);
    }
  });
  return { width, height };
}

// Độ dịch để người ngoài cùng bên trái/trên của phần đang hiển thị cách mép đúng một khoảng lề.
export function renderOffsetFor(people = []) {
  if (!people.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  people.forEach((person) => {
    minX = Math.min(minX, toInt(person.tree_x, 0));
    minY = Math.min(minY, toInt(person.tree_y, 0));
  });
  return { x: Math.max(0, CANVAS_PADDING - minX), y: Math.max(0, CANVAS_PADDING - minY) };
}
