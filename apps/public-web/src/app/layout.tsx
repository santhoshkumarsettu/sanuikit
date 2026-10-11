import type { Metadata } from 'next'
import 'sanui/styles.css'
import '@vstudio/map-engine/styles.css'
import './globals.css'
import { PublicProviders } from '../components/providers'

export const metadata: Metadata = { title: 'VStudio · Property maps', description: 'Explore available properties on an interactive layout.' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><PublicProviders>{children}</PublicProviders></body></html> }
