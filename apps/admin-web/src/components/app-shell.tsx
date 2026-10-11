'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { vstudioApi } from '@vstudio/api-client'
import { demoProject } from '@vstudio/utils'

const navigation = [
  { href: '/', label: 'Overview', icon: '◫' }, { href: '/projects', label: 'Projects', icon: '⌂' },
  { href: '/studio', label: 'Map Studio', icon: '⌗' }, { href: '/inventory', label: 'Inventory', icon: '▤' },
  { href: '/bookings', label: 'Bookings', icon: '▣' }, { href: '/reports', label: 'Reports', icon: '▥' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isSuccess } = useQuery({ queryKey: ['projects'], queryFn: () => vstudioApi.projects(), retry: false, staleTime: 60_000 })
  const account = useQuery({ queryKey: ['me'], queryFn: () => vstudioApi.me(), retry: false, staleTime: 60_000 })
  useEffect(() => { if (account.error && 'status' in account.error && account.error.status === 401) router.replace('/login') }, [account.error, router])
  const current = navigation.find(item => item.href === pathname)?.label ?? (pathname.startsWith('/projects/') ? 'Project details' : 'Settings')
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="vstudio-brand"><span className="vstudio-logo">V</span> VStudio</Link>
      <button className="org-switcher" type="button"><span className="org-avatar">{(account.data?.organization.name ?? 'Acme').slice(0, 2).toUpperCase()}</span><span className="org-name">{account.data?.organization.name ?? 'Acme Properties'}<small>{account.data?.role ?? 'Demo workspace'}</small></span><span aria-hidden="true">⌄</span></button>
      <p className="nav-label">Workspace</p>
      <nav className="side-nav" aria-label="Workspace navigation">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="sidebar-bottom"><p className="nav-label">Manage</p><Link href="/settings">Settings</Link><Link href="/components">Design system</Link><div className="user-card"><span className="user-avatar">SJ</span><span><strong>San Jose</strong><small>Owner</small></span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><span>{account.data?.organization.name ?? 'Acme Properties'}</span><span>/</span><strong>{current}</strong></div><div className="topbar-actions"><div className="search-trigger"><span>⌕</span> Search anything <kbd>⌘ K</kbd></div><button type="button" className="icon-action" aria-label="Notifications">♧</button><button type="button" className="icon-action" aria-label="Sign out" onClick={() => void vstudioApi.logout().finally(() => router.push('/login'))}>↗</button></div></header>
      <main className="page-content">{children}<span className="api-indicator" title={isSuccess ? 'Connected to VStudio API' : 'Showing local sample data'}>{isSuccess ? 'Connected' : `Demo · ${demoProject.name}`}</span></main>
    </div>
  </div>
}
