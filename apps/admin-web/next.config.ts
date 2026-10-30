import type { NextConfig } from 'next'

const nextConfig: NextConfig = { transpilePackages: ['sanui', '@vstudio/map-engine', '@vstudio/types', '@vstudio/api-client'] }
export default nextConfig
