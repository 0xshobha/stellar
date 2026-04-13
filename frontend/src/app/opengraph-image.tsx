import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: 'linear-gradient(135deg, #020617 0%, #0f172a 45%, #1d4ed8 100%)',
          color: '#E2E8F0'
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.85 }}>Stellar Net</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>x402 Agent Economy</div>
          <div style={{ fontSize: 32, opacity: 0.92 }}>Recursive hiring, protocol traces, and Stellar settlement</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>Manager → Workers → Recursive Agents</div>
      </div>
    ),
    {
      ...size
    }
  );
}