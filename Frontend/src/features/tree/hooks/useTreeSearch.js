import { useMemo, useState } from "react";

const asArray = (value) => (Array.isArray(value) ? value : []);

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function personName(person) {
  return (
    person?.display_name ||
    [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() ||
    ""
  );
}

function birthYear(person) {
  const match = String(person?.birth_date || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function matchesPerson(person, normalizedQuery) {
  if (!normalizedQuery) return false;
  const fields = [
    personName(person),
    `doi ${person?.generation ?? ""}`,
    `generation ${person?.generation ?? ""}`,
    person?.generation,
    person?.birth_date,
    birthYear(person),
  ];
  return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
}

export function useTreeSearch(people = []) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [highlightedPersonId, setHighlightedPersonId] = useState(null);

  const results = useMemo(() => {
    const normalized = normalizeSearchText(submittedQuery);
    if (!normalized) return [];
    return asArray(people).filter((person) => matchesPerson(person, normalized)).slice(0, 60);
  }, [people, submittedQuery]);

  const submitSearch = () => {
    setSubmittedQuery(query);
    setHighlightedPersonId(null);
  };

  const clearSearch = () => {
    setQuery("");
    setSubmittedQuery("");
    setHighlightedPersonId(null);
  };

  const markResult = (personId) => {
    const id = Number(personId);
    setHighlightedPersonId(Number.isFinite(id) ? id : null);
  };

  return {
    query,
    setQuery,
    submittedQuery,
    results,
    highlightedPersonId,
    submitSearch,
    clearSearch,
    markResult,
  };
}

