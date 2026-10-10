import type { HTMLAttributes, ReactNode } from 'react'
export interface TextProps extends HTMLAttributes<HTMLElement> { as?: 'p' | 'span' | 'div' | 'label'; size?: 'sm' | 'md' | 'lg'; muted?: boolean; children: ReactNode }
export function Text({ as: Element = 'p', size = 'md', muted = false, className = '', ...props }: TextProps) { return <Element className={`sanui-text sanui-text--${size}${muted ? ' sanui-text--muted' : ''} ${className}`.trim()} {...props} /> }
