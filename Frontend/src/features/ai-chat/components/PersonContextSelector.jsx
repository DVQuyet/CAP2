import { useMemo, useState } from "react";

export default function PersonContextSelector({ people = [], loading, error, onSelect }) {
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return people.slice(0, 80);
    return people
      .filter((person) => String(person.name || person.display_name || "").toLowerCase().includes(normalized))
      .slice(0, 80);
  }, [people, query]);

  const handleSelect = async (person) => {
    setSavingId(person.id);
    try {
      await onSelect?.(person);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="ai-context-selector">
      <div className="ai-context-title">
        <span className="material-symbols-outlined">person_search</span>
        <div>
          <strong>Bạn là ai trong gia phả?</strong>
          <small>Chọn đúng thành viên để trợ lý tính quan hệ từ dữ liệu thật.</small>
        </div>
      </div>
      {error ? <div className="ai-context-error">{error}</div> : null}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm tên của bạn..."
        className="ai-context-search"
      />
      <div className="ai-context-list">
        {loading ? <div className="ai-context-muted">Đang tải danh sách thành viên...</div> : null}
        {!loading && !filteredPeople.length ? (
          <div className="ai-context-muted">Chưa tìm thấy thành viên phù hợp.</div>
        ) : null}
        {filteredPeople.map((person) => (
          <button
            key={person.id}
            type="button"
            className="ai-context-person"
            onClick={() => handleSelect(person)}
            disabled={savingId === person.id}
          >
            <span>{person.name || person.display_name}</span>
            <small>{person.generation ? `Đời ${person.generation}` : "Chưa rõ đời"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
