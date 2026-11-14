import { useMemo } from "react";
import { toInt } from "../model/geometry.js";
import { renderOffsetFor, sceneCanvasSize } from "../model/scene/bounds.js";
import { buildDisplayTree } from "../model/scene/displayTree.js";
import { buildDisplayTreeLines } from "../model/scene/lines.js";

// Từ phần cây đang hiển thị (đã lọc nhánh thu gọn) dựng ra thứ cần vẽ: thẻ, đường nối, kích thước vùng vẽ.
// withControls = false: không dựng tay nắm chỉnh đường (người xem không có quyền sửa bố cục).
export function useTreeScene({ people, families, childRows, cardOrientation, referencePlacements, lineRoutes, withControls }) {
  const renderOffset = useMemo(() => renderOffsetFor(people), [people]);
  const renderPeople = useMemo(
    () => people.map((person) => ({
      ...person,
      tree_x: toInt(person.tree_x, 0) + renderOffset.x,
      tree_y: toInt(person.tree_y, 0) + renderOffset.y,
    })),
    [people, renderOffset.x, renderOffset.y],
  );
  const renderPersonById = useMemo(
    () => new Map(renderPeople.map((person) => [Number(person.id), person])),
    [renderPeople],
  );
  const displayTree = useMemo(
    () => buildDisplayTree(renderPeople, families, childRows, { cardOrientation, referencePlacements }),
    [cardOrientation, childRows, families, referencePlacements, renderPeople],
  );
  const lines = useMemo(
    () => buildDisplayTreeLines(displayTree, families, childRows, lineRoutes, { controls: withControls }),
    [childRows, displayTree, families, lineRoutes, withControls],
  );
  const canvasSize = useMemo(() => sceneCanvasSize(displayTree.nodes, lines), [displayTree.nodes, lines]);

  return { renderPeople, renderPersonById, displayTree, lines, canvasSize };
}
