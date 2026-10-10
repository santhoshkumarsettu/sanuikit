import type { HTMLAttributes } from 'react'
export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> { width?: string | number; height?: string | number; variant?: 'text' | 'circular' | 'rectangular' }
export function Skeleton({ width, height, variant = 'text', className = '', style, ...props }: SkeletonProps) { return <span aria-hidden="true" className={`sanui-skeleton sanui-skeleton--${variant} ${className}`.trim()} style={{ width, height, ...style }} {...props} /> }
