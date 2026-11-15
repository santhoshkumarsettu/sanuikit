import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['sanui', '@vstudio/map-engine', '@vstudio/types', '@vstudio/api-client'],
}
export default nextConfig
