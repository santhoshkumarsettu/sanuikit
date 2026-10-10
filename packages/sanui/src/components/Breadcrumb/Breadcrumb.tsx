import type { HTMLAttributes, ReactNode } from 'react'
export interface BreadcrumbItem { label: ReactNode; href?: string }
export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> { items: BreadcrumbItem[] }
export function Breadcrumb({ items, ...props }: BreadcrumbProps) { return <nav aria-label="Breadcrumb" {...props}><ol className="sanui-breadcrumb">{items.map((item, index) => <li key={index}>{index < items.length - 1 && item.href ? <a href={item.href}>{item.label}</a> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>}{index < items.length - 1 && <span className="sanui-breadcrumb__separator" aria-hidden="true">/</span>}</li>)}</ol></nav> }
