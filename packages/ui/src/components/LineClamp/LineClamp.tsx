import type { HTMLAttributes, ReactNode } from 'react'
export interface LineClampProps extends HTMLAttributes<HTMLDivElement> { lines?: number; children: ReactNode }
export function LineClamp({ lines = 2, style, ...props }: LineClampProps) { return <div style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden', ...style }} {...props} /> }
