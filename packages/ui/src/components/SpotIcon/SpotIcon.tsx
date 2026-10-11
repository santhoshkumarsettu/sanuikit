import type { HTMLAttributes, ReactNode } from 'react'
export interface SpotIconProps extends HTMLAttributes<HTMLSpanElement> { children: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' }
export function SpotIcon({ children, tone = 'primary', className = '', ...props }: SpotIconProps) { return <span aria-hidden="true" className={`sanui-spot-icon sanui-spot-icon--${tone} ${className}`.trim()} {...props}>{children}</span> }
