// Gói lõi vẽ cây thành các lời gọi mà treeSceneCapture dùng.
import { layoutTree, mergeManualLayout } from "../../src/features/tree/model/layout/autoLayout.js";
import { buildDisplayTree } from "../../src/features/tree/model/scene/displayTree.js";
import { buildDisplayTreeLines } from "../../src/features/tree/model/scene/lines.js";

export const treeSceneApi = {
  layout: layoutTree,
  autoLayoutPeople: (people, families, childRows, options) => layoutTree(people, families, childRows, options).people,
  computeReferencePlacements: (people, families, childRows, options) => layoutTree(people, families, childRows, options).references,
  mergeManualAndAutoLayout: (people, families, childRows, options) => (
    mergeManualLayout(people, layoutTree(people, families, childRows, options).people)
  ),
  buildDisplayTree,
  buildDisplayTreeLines,
};
