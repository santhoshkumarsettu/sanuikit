import type { HTMLAttributes, ReactNode } from 'react'
export interface ContainerProps extends HTMLAttributes<HTMLDivElement> { size?: 'sm' | 'md' | 'lg' | 'full'; children: ReactNode }
export function Container({ size = 'lg', className = '', ...props }: ContainerProps) { return <div className={`sanui-container sanui-container--${size} ${className}`.trim()} {...props} /> }
