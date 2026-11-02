import type { NextConfig } from 'next'
import withPWA from '@ducanh2912/next-pwa'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // The scheduled report route renders PDFs on the server with react-pdf.
  serverExternalPackages: ['@react-pdf/renderer'],
  // react-pdf loads pdfkit's built-in font files at runtime, so Vercel's bundler does not
  // see them; include them explicitly or PDF rendering fails on the server.
  outputFileTracingIncludes: {
    '/api/reports/send': ['./node_modules/pdfkit/js/**/*', './node_modules/@react-pdf/**/*', './node_modules/fontkit/**/*'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'lbbqqvbehinounqyalfn.supabase.co' },
    ],
  },
}

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: true,
  workboxOptions: { disableDevLogs: true },
})(nextConfig)
