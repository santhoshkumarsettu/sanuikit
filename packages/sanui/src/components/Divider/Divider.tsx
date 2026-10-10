import type { HTMLAttributes } from 'react'
export interface DividerProps extends HTMLAttributes<HTMLHRElement> { orientation?: 'horizontal' | 'vertical' }
export function Divider({ orientation = 'horizontal', className = '', ...props }: DividerProps) { return <hr className={`sanui-divider sanui-divider--${orientation} ${className}`.trim()} {...props} /> }
