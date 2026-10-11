import type { HTMLAttributes, ReactNode } from 'react'
export interface StyledTextProps extends HTMLAttributes<HTMLElement> { as?: 'span' | 'p' | 'strong' | 'small' | 'label'; size?: 'sm' | 'md' | 'lg'; weight?: 'regular' | 'medium' | 'semibold' | 'bold'; children: ReactNode }
export function StyledText({ as: Element = 'span', size = 'md', weight = 'regular', className = '', ...props }: StyledTextProps) { return <Element className={`sanui-text sanui-text--${size} sanui-text--${weight} ${className}`.trim()} {...props} /> }
