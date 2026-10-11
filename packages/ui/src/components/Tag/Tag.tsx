import type { HTMLAttributes, ReactNode } from 'react'
export interface TagProps extends HTMLAttributes<HTMLSpanElement> { children: ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'warning' }
export function Tag({ children, tone = 'neutral', className = '', ...props }: TagProps) { return <span className={`sanui-tag sanui-tag--${tone} ${className}`.trim()} {...props}>{children}</span> }
