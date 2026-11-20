'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { vstudioApi } from '@vstudio/api-client'
import type { Permission } from '@vstudio/auth'
import { demoProject } from '@vstudio/utils'
import { Skeleton, Spinner, ThemeSwitcher } from 'sanui'
import { usePermissions } from '../hooks/use-permissions'
import { useAppearance } from './appearance-provider'

type NavItem = { href: string; label: string; icon: string; permission: Permission }
type CurrentPage = Pick<NavItem, 'href' | 'label' | 'permission'>
const navigationGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Workspace', items: [
    { href: '/', label: 'Overview', icon: '◫', permission: 'VIEW_DASHBOARD' },
    { href: '/projects', label: 'Projects', icon: '⌂', permission: 'VIEW_PROJECTS' },
  ] },
  { label: 'Map & inventory', items: [
    { href: '/studio', label: 'Map Studio', icon: '⌗', permission: 'VIEW_MAP' },
    { href: '/inventory', label: 'Inventory', icon: '▤', permission: 'VIEW_INVENTORY' },
  ] },
  { label: 'Sales', items: [
    { href: '/bookings', label: 'Bookings', icon: '▣', permission: 'VIEW_BOOKINGS' },
    { href: '/reports', label: 'Reports', icon: '▥', permission: 'VIEW_REPORTS' },
  ] },
]
const manageItems: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: '⚙', permission: 'VIEW_SETTINGS' },
  { href: '/access-control', label: 'Access control', icon: '♧', permission: 'MANAGE_USERS' },
]
const allNavItems = [...navigationGroups.flatMap(group => group.items), ...manageItems]

function itemForPath(pathname: string): CurrentPage | undefined {
  if (pathname === '/projects/new') return { href: pathname, label: 'New project', permission: 'CREATE_PROJECT' }
  if (pathname.startsWith('/projects/')) return { href: '/projects', label: 'Project details', permission: 'VIEW_PROJECTS' }
  if (pathname.startsWith('/settings')) return manageItems[0]
  return allNavItems.find(item => item.href === pathname)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isSuccess } = useQuery({ queryKey: ['projects'], queryFn: () => vstudioApi.projects(), retry: false, staleTime: 60_000 })
  const { accountQuery: account, can } = usePermissions()
  const { family, setFamily } = useAppearance()
  useEffect(() => { if (account.error && 'status' in account.error && account.error.status === 401) router.replace('/login') }, [account.error, router])
  const current = itemForPath(pathname)
  const canOpenSettings = can('VIEW_SETTINGS') || can('MANAGE_USERS') || can('MANAGE_API_KEYS')
  const visible = (item: NavItem) => {
    if (!account.data) return true
    if (item.href === '/settings') return canOpenSettings
    return can(item.permission)
  }
  const accessDenied = Boolean(current && account.data && !(current.href === '/settings'
    ? canOpenSettings
    : can(current.permission)))
  const accountUnavailable = account.isError && !account.data
  const displayName = account.data?.user.name ?? '—'
  const roleLabel = account.data?.roleLabel ?? account.data?.role ?? '—'
  const organizationName = account.data?.organization.name ?? (accountUnavailable ? 'Workspace offline' : '—')
  const apiConnected = account.isSuccess || Boolean(account.data) || isSuccess

  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="vstudio-brand"><span className="vstudio-logo">V</span> VStudio</Link>
      {account.isPending ? (
        <div className="org-switcher org-switcher--loading" aria-label="Loading workspace" aria-busy="true">
          <Skeleton variant="circular" width={28} height={28} />
          <span className="org-name org-loading-copy"><Skeleton width="106px" height={10} /><Skeleton width="48px" height={9} /></span>
          <Spinner label="Loading workspace" size="sm" />
        </div>
      ) : accountUnavailable ? (
        <button className="org-switcher org-switcher--error" type="button" onClick={() => void account.refetch()} disabled={account.isFetching}>
          <span className="org-avatar" aria-hidden="true">!</span>
          <span className="org-name"><strong>Workspace offline</strong><small>{account.isFetching ? 'Reconnecting…' : 'Click to retry'}</small></span>
          {account.isFetching ? <Spinner label="Reconnecting workspace" size="sm" /> : <span aria-hidden="true">↻</span>}
        </button>
      ) : (
        <button className="org-switcher" type="button"><span className="org-avatar">{organizationName.slice(0, 2).toUpperCase()}</span><span className="org-name">{organizationName}<small>{roleLabel}</small></span><span aria-hidden="true">⌄</span></button>
      )}
      {navigationGroups.map(group => {
        const items = group.items.filter(visible)
        if (!items.length) return null
        return <section className="nav-group" key={group.label} aria-label={`${group.label} navigation`}>
          <p className="nav-label">{group.label}</p>
          <nav className="side-nav">{items.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href || (item.href === '/projects' && pathname.startsWith('/projects/')) ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
        </section>
      })}
      <div className="sidebar-bottom">
        <p className="nav-label">Manage</p>
        <nav className="side-nav" aria-label="Management navigation">
          {manageItems.filter(visible).map(item => <Link key={item.href} href={item.href} aria-current={(item.href === '/settings' && pathname.startsWith('/settings')) || pathname === item.href ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
          <Link href="/components" aria-current={pathname === '/components' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">◈</span>Design system</Link>
        </nav>
        {account.isPending ? (
          <div className="user-card user-card--loading" aria-label="Loading account" aria-busy="true">
            <Skeleton variant="circular" width={29} height={29} />
            <span className="user-loading-copy"><Skeleton width="72px" height={9} /><Skeleton width="42px" height={8} /></span>
          </div>
        ) : accountUnavailable ? (
          <div className="user-card user-card--error"><span className="user-avatar" aria-hidden="true">!</span><span><strong>Account not loaded</strong><small>Retry from workspace panel</small></span></div>
        ) : (
          <div className="user-card"><span className="user-avatar">{displayName.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span></div>
        )}
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs">{account.isPending ? <Skeleton width={116} height={11} /> : <span>{organizationName}</span>}<span>/</span><strong>{current?.label ?? 'Workspace'}</strong></div><div className="topbar-actions"><ThemeSwitcher className="topbar-theme-switcher" value={family} onChange={setFamily} /><div className="search-trigger"><span>⌕</span> Search anything <kbd>⌘ K</kbd></div><button type="button" className="icon-action" aria-label="Notifications">♧</button><button type="button" className="icon-action" aria-label="Sign out" onClick={() => void vstudioApi.logout().finally(() => router.push('/login'))}>↗</button></div></header>
      <main className="page-content">
        {accountUnavailable && <div className="account-error-banner" role="alert"><div><strong>Workspace details could not be loaded</strong><p>The account request failed. Retry to load the current workspace and member details.</p></div><button type="button" onClick={() => void account.refetch()} disabled={account.isFetching}>{account.isFetching ? <Spinner label="Retrying account request" size="sm" /> : 'Retry'}</button></div>}
        {accessDenied ? <section className="access-denied-card" role="status"><span className="access-denied-icon" aria-hidden="true">⌑</span><div><h1>Access not granted</h1><p>Your <strong>{roleLabel}</strong> role doesn’t include permission to open {current?.label.toLowerCase()}. Ask a workspace owner to review your role in Access control.</p><Link href="/">Return to overview</Link></div></section> : children}
        <span className={`api-indicator${account.isPending ? ' api-indicator--loading' : ''}`} title={apiConnected ? 'Connected to VStudio API' : 'Showing local sample data'} aria-live="polite">
          {account.isPending ? <><Spinner label="Loading workspace data" size="sm" />Loading workspace…</> : apiConnected ? 'Connected' : `Demo · ${demoProject.name}`}
        </span>
      </main>
    </div>
  </div>
}
