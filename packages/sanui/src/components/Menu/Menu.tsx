import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
export interface MenuProps extends HTMLAttributes<HTMLDetailsElement> { label: string; children: ReactNode }
export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode }
export function Menu({ label, children, ...props }: MenuProps) { return <details className="sanui-menu" {...props}><summary>{label}</summary><div className="sanui-menu__items" role="group">{children}</div></details> }
export function MenuItem({ children, className = '', ...props }: MenuItemProps) { return <button type="button" className={`sanui-menu__item ${className}`.trim()} {...props}>{children}</button> }
