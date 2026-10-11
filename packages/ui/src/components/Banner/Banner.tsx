import type { HTMLAttributes, ReactNode } from 'react'
export interface BannerProps extends HTMLAttributes<HTMLElement> { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }
export function Banner({ tone = 'neutral', className = '', ...props }: BannerProps) { return <aside className={`sanui-banner sanui-banner--${tone} ${className}`.trim()} {...props} /> }
