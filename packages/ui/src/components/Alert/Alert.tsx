import type { HTMLAttributes, ReactNode } from 'react'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children: ReactNode
}

export function Alert({ tone = 'info', title, className = '', children, ...props }: AlertProps) {
  return (
    <div className={`sanui-alert sanui-alert--${tone} ${className}`.trim()} role={tone === 'danger' ? 'alert' : 'status'} {...props}>
      {title && <strong className="sanui-alert__title">{title}</strong>}
      <div>{children}</div>
    </div>
  )
}
