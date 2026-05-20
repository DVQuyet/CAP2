export default function LandingFamilyTree({ compact = false }) {
  const people = [
    { className: "landing-tree-root", name: "THỦY TỔ NGUYỄN TRÍ", title: "Tổ Phúc Khánh", gen: "ĐỜI 1", life: "Sinh: 1800 - Mất: 1875" },
    { className: "landing-tree-child", name: "NGUYỄN TRÍ CƯỜNG", title: "Cụ Ông", gen: "ĐỜI 2", life: "Sinh: 1830 - Mất: 1908" },
    { className: "landing-tree-child", name: "NGUYỄN TRÍ NAM", title: "Cụ Ông", gen: "ĐỜI 2", life: "Sinh: 1850 - Mất: 1920" },
  ];

  return (
    <div className={`landing-tree-mockup${compact ? " compact" : ""}`} aria-label="Mẫu sơ đồ gia phả minh họa">
      <div className="landing-tree-root-wrap">
        <article className={`landing-person-card ${people[0].className}`}>
          <div className="landing-person-icon"><span className="material-symbols-outlined">person</span></div>
          <h3>{people[0].name}</h3><p>{people[0].title}</p><strong>{people[0].gen}</strong><small>{people[0].life}</small>
        </article>
      </div>
      <div className="landing-tree-lines" aria-hidden="true">
        <span className="landing-line-down" /><span className="landing-line-horizontal" /><span className="landing-line-left" /><span className="landing-line-right" />
      </div>
      <div className="landing-tree-children">
        {people.slice(1).map((person) => (
          <article className={`landing-person-card ${person.className}`} key={person.name}>
            <div className="landing-person-icon"><span className="material-symbols-outlined">person</span></div>
            <h3>{person.name}</h3><p>{person.title}</p><strong>{person.gen}</strong><small>{person.life}</small>
          </article>
        ))}
      </div>
    </div>
  );
}
