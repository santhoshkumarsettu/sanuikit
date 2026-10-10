import type { HTMLAttributes, ReactNode } from 'react'
export interface CalloutProps extends HTMLAttributes<HTMLDivElement> { title?: string; icon?: ReactNode; children: ReactNode; tone?: 'info' | 'success' | 'warning' }
export function Callout({ title, icon, children, tone = 'info', className = '', ...props }: CalloutProps) { return <div className={`sanui-callout sanui-callout--${tone} ${className}`.trim()} {...props}>{icon && <span className="sanui-callout__icon" aria-hidden="true">{icon}</span>}<div>{title && <strong>{title}</strong>}<div>{children}</div></div></div> }
