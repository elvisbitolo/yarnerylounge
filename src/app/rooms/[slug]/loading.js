export default function RoomLoading() {
  return (
    <div className="roomLoadingPage">
      <div className="roomLoadingContainer">
        <div className="roomLoadingBlock roomLoadingTitle" />
        <div className="roomLoadingBlock roomLoadingLine" />
        <div className="roomLoadingBlock roomLoadingCard" />
      </div>
      <style>{`
        .roomLoadingPage{min-height:100vh;background:#0d0d0d;padding:24px}
        .roomLoadingContainer{max-width:1100px;margin:0 auto}
        .roomLoadingBlock{background:linear-gradient(90deg,#1a1a1a 0%,#232323 50%,#1a1a1a 100%);background-size:200% 100%;border-radius:8px;animation:roomShimmer 1.4s ease infinite}
        .roomLoadingTitle{width:180px;height:28px;margin:8px 0}
        .roomLoadingLine{width:360px;max-width:80%;height:14px;margin-bottom:24px}
        .roomLoadingCard{height:440px;border-radius:14px}
        @keyframes roomShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
    </div>
  );
}