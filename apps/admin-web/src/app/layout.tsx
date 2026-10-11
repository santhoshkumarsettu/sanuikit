import type { Metadata } from 'next'
import 'sanui/styles.css'
import '@vstudio/map-engine/styles.css'
import './globals.css'
import { AppProviders } from '../components/app-providers'

export const metadata: Metadata = {
  title: { default: 'VStudio — Property inventory, mapped.', template: '%s · VStudio' },
  description: 'Manage property projects, interactive layouts, inventory, and bookings in one workspace.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppProviders>{children}</AppProviders></body></html>
}
