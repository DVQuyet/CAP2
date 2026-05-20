export function getPersonHighlightState(person, options = {}) {
  const id = Number(person?.id);
  const onlineIds = options.onlinePersonIds || new Set();
  const editingIds = options.editingPersonIds || new Set();
  const errorMap = options.validationErrors || new Map();

  return {
    online: onlineIds.has(id),
    search: Number(options.searchPersonId) === id,
    selected: Number(options.selectedPersonId) === id,
    self: Number(options.selfPersonId) === id,
    editing: editingIds.has(id),
    error: errorMap.has(id),
    deceased: Number(person?.is_living) === 0,
    errors: errorMap.get(id) || [],
  };
}

export function highlightClassNames(state = {}) {
  return [
    state.online ? "is-online" : "",
    state.search ? "is-searchMatch" : "",
    state.selected ? "is-selected" : "",
    state.self ? "is-self" : "",
    state.editing ? "is-editing" : "",
    state.error ? "is-invalid" : "",
  ].filter(Boolean).join(" ");
}

