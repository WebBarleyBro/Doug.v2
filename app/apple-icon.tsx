import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #d4a843 0%, #b8891e 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: '#0f0f0d', fontSize: '110px', fontWeight: '900', lineHeight: 1 }}>
          D
        </span>
      </div>
    ),
    { ...size }
  )
}
