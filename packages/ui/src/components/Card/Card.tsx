import type { HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'article' | 'section' | 'div'
  interactive?: boolean
}

export function Card({ as: Element = 'div', interactive = false, className = '', ...props }: CardProps) {
  return <Element className={`sanui-card${interactive ? ' sanui-card--interactive' : ''} ${className}`.trim()} {...props} />
}
