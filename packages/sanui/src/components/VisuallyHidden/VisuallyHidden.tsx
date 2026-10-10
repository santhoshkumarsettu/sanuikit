import type { HTMLAttributes, ReactNode } from 'react'
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> { children: ReactNode; as?: 'span' | 'div' }
export function VisuallyHidden({ as: Element = 'span', ...props }: VisuallyHiddenProps) { return <Element className="sanui-visually-hidden" {...props} /> }
