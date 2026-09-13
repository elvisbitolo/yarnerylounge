export default function RoomsLoading() {
  return (
    <div className="roomsLoadingPage">
      <div className="roomsLoadingContainer">
        <div className="roomsLoadingBlock roomsLoadingTitle" />
        <div className="roomsLoadingBlock roomsLoadingLine" />
        <div className="roomsLoadingGrid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="roomsLoadingBlock roomsLoadingCard" />
          ))}
        </div>
      </div>
      <style>{`
        .roomsLoadingPage{min-height:100vh;background:#0d0d0d;padding:24px}
        .roomsLoadingContainer{max-width:1100px;margin:0 auto}
        .roomsLoadingBlock{background:linear-gradient(90deg,#1a1a1a 0%,#232323 50%,#1a1a1a 100%);background-size:200% 100%;border-radius:8px;animation:roomsShimmer 1.4s ease infinite}
        .roomsLoadingTitle{width:180px;height:28px;margin:8px 0}
        .roomsLoadingLine{width:360px;max-width:80%;height:14px;margin-bottom:24px}
        .roomsLoadingGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
        .roomsLoadingCard{height:260px;border-radius:14px}
        @keyframes roomsShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
    </div>
  );
}