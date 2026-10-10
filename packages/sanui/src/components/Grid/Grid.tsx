import type { HTMLAttributes, ReactNode } from 'react'
export interface GridProps extends HTMLAttributes<HTMLDivElement> { columns?: number; gap?: string; children: ReactNode }
export function Grid({ columns = 2, gap = '1rem', style, ...props }: GridProps) { return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap, ...style }} {...props} /> }
