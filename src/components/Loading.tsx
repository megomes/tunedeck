export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="container mt-6" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row" style={{ marginBottom: 8 }}>
          <div className="thumb" style={{ width: 112 }} />
          <div className="row-main" style={{ gap: 8 }}>
            <div className="skeleton-line" style={{ width: "60%" }} />
            <div className="skeleton-line" style={{ width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
