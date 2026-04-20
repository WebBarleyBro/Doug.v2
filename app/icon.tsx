import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: '42px',
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
