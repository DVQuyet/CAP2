export default function FamilyPathVisualizer({ pathVisualizer }) {
  const crumbs = pathVisualizer?.breadcrumb || [];
  if (!crumbs.length) return null;

  return (
    <div className="ai-path-visualizer" aria-label="Đường quan hệ">
      {crumbs.map((crumb, index) => (
        <div key={`${crumb}-${index}`} className="ai-path-node">
          <span>{crumb}</span>
          {index < crumbs.length - 1 ? (
            <span className="material-symbols-outlined ai-path-arrow">arrow_forward</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
