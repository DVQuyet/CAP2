import { useCallback, useMemo, useState } from "react";
import { filterTreeData, getAncestorPathIds, getHiddenDescendantIds, getRelatedRootViewIds } from "../utils/treeFilter";

const asArray = (value) => (Array.isArray(value) ? value : []);

export function useTreeViewMode({ people = [], families = [], childRows = [] }) {
  const [mode, setMode] = useState("full");
  const [rootPersonId, setRootPersonId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  const baseVisibleIds = useMemo(() => {
    if (mode === "root" && rootPersonId) {
      return getRelatedRootViewIds(rootPersonId, people, families, childRows);
    }
    return new Set(asArray(people).map((person) => Number(person.id)));
  }, [childRows, families, mode, people, rootPersonId]);

  const visibleData = useMemo(() => {
    const hidden = getHiddenDescendantIds([...collapsedIds], people, families, childRows);
    const ids = new Set([...baseVisibleIds].filter((id) => !hidden.has(Number(id))));
    return filterTreeData(people, families, childRows, ids);
  }, [baseVisibleIds, childRows, collapsedIds, families, people]);

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

  const expandPathToPerson = useCallback((personId) => {
    const path = getAncestorPathIds(personId, people, families, childRows);
    if (!path.size) return;
    setCollapsedIds((current) => {
      const next = new Set(current);
      path.forEach((id) => next.delete(id));
      return next;
    });
  }, [childRows, families, people]);

  return {
    mode,
    rootPersonId,
    collapsedIds,
    visibleData,
    setFullMode,
    setRootMode,
    toggleCollapse,
    expandPathToPerson,
  };
}

