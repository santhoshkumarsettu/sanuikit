import type { HTMLAttributes } from 'react'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export function Badge({ tone = 'neutral', className = '', ...props }: BadgeProps) {
  return <span className={`sanui-badge sanui-badge--${tone} ${className}`.trim()} {...props} />
}
