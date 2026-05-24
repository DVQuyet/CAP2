import { useCallback, useMemo, useState } from "react";
import { buildFamilyIndexes, filterTreeData, getAncestorPathIds, getDescendantIds, getHiddenDescendantIds, getRelatedRootViewIds } from "../utils/treeFilter";

const asArray = (value) => (Array.isArray(value) ? value : []);

export function useTreeViewMode({ people = [], families = [], childRows = [] }) {
  const [mode, setMode] = useState("full");
  const [rootPersonId, setRootPersonId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [hiddenAncestorIds, setHiddenAncestorIds] = useState(() => new Set());

  const baseVisibleIds = useMemo(() => {
    if (mode === "root" && rootPersonId) {
      return getRelatedRootViewIds(rootPersonId, people, families, childRows);
    }
    return new Set(asArray(people).map((person) => Number(person.id)));
  }, [childRows, families, mode, people, rootPersonId]);

  const visibleData = useMemo(() => {
    const hidden = getHiddenDescendantIds([...collapsedIds], people, families, childRows);
    hiddenAncestorIds.forEach((id) => hidden.add(Number(id)));
    const ids = new Set([...baseVisibleIds].filter((id) => !hidden.has(Number(id))));
    return filterTreeData(people, families, childRows, ids);
  }, [baseVisibleIds, childRows, collapsedIds, families, hiddenAncestorIds, people]);

  const setFullMode = useCallback(() => {
    setMode("full");
    setRootPersonId(null);
  }, []);

  const setRootMode = useCallback((personId) => {
    const id = Number(personId);
    if (!Number.isFinite(id) || id <= 0) return;
    setMode("root");
    setRootPersonId(id);
  }, []);

  const toggleCollapse = useCallback((personId) => {
    const id = Number(personId);
    if (!Number.isFinite(id) || id <= 0) return;
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleDescendantBranch = useCallback((personId) => {
    const id = Number(personId);
    if (!Number.isFinite(id) || id <= 0) return;
    const indexes = buildFamilyIndexes(people, families, childRows);
    const descendants = getDescendantIds(id, indexes);
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        descendants.forEach((descendantId) => next.delete(Number(descendantId)));
      } else {
        next.add(id);
      }
      return next;
    });
  }, [childRows, families, people]);

  const toggleAncestorBranch = useCallback((personId) => {
    const id = Number(personId);
    if (!Number.isFinite(id) || id <= 0) return;
    const ancestors = getAncestorPathIds(id, people, families, childRows);
    if (!ancestors.size) return;
    setHiddenAncestorIds((current) => {
      const next = new Set(current);
      const hasHiddenAncestor = Array.from(ancestors).some((ancestorId) => next.has(Number(ancestorId)));
      if (hasHiddenAncestor) {
        ancestors.forEach((ancestorId) => next.delete(Number(ancestorId)));
      } else {
        ancestors.forEach((ancestorId) => next.add(Number(ancestorId)));
      }
      return next;
    });
  }, [childRows, families, people]);

  const expandPathToPerson = useCallback((personId) => {
    const path = getAncestorPathIds(personId, people, families, childRows);
    if (!path.size) return;
    setCollapsedIds((current) => {
      const next = new Set(current);
      path.forEach((id) => next.delete(id));
      return next;
    });
    setHiddenAncestorIds((current) => {
      const next = new Set(current);
      path.forEach((id) => next.delete(id));
      return next;
    });
  }, [childRows, families, people]);

  return {
    mode,
    rootPersonId,
    collapsedIds,
    hiddenAncestorIds,
    visibleData,
    setFullMode,
    setRootMode,
    toggleCollapse,
    toggleDescendantBranch,
    toggleAncestorBranch,
    expandPathToPerson,
  };
}
