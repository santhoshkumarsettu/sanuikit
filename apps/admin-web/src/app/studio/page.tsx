import { Suspense } from 'react'
import { AppShell } from '../../components/app-shell'
import { MapStudio } from './studio-client'

export default function MapStudioPage() { return <AppShell><Suspense fallback={<div className="page-loading">Loading Map Studio…</div>}><MapStudio /></Suspense></AppShell> }
