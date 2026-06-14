'use client';

export default function CardBack() {
  return (
    <div className="cardback">
      <div className="cb-vines" />
      <div className="cb-dither" />
      <div className="cb-frame" />
      <div className="cb-frame2" />
      <div className="cb-hex top" />
      <div className="cb-center" style={{ width: '62%', aspectRatio: '1' }}>
        <div className="cb-star" />
        <div className="cb-star-in" />
        <div className="cb-rose" />
        <div className="cb-dot" />
      </div>
      <div className="cb-hex bot" />
      <span className="cb-corner tl">╳</span>
      <span className="cb-corner tr">╳</span>
      <span className="cb-corner bl">╳</span>
      <span className="cb-corner br">╳</span>
    </div>
  );
}
