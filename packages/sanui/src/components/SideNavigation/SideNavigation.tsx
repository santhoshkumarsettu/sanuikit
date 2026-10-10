import type { HTMLAttributes, ReactNode } from 'react'
export interface SideNavigationItem { label: ReactNode; href: string; active?: boolean }
export interface SideNavigationProps extends HTMLAttributes<HTMLElement> { items: SideNavigationItem[]; label?: string }
export function SideNavigation({ items, label = 'Primary navigation', ...props }: SideNavigationProps) { return <nav aria-label={label} {...props}><ul className="sanui-side-navigation">{items.map((item, index) => <li key={index}><a href={item.href} aria-current={item.active ? 'page' : undefined} className={item.active ? 'is-active' : ''}>{item.label}</a></li>)}</ul></nav> }
