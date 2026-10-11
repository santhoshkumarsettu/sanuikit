import type { HTMLAttributes } from 'react'

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Spinner({ label = 'Loading', size = 'md', className = '', ...props }: SpinnerProps) {
  return <span className={`sanui-spinner sanui-spinner--${size} ${className}`.trim()} role="status" {...props}><span className="sanui-visually-hidden">{label}</span></span>
}
