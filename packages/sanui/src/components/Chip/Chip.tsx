import type { HTMLAttributes, ReactNode } from 'react'
export interface ChipProps extends HTMLAttributes<HTMLSpanElement> { children: ReactNode; onRemove?: () => void }
export function Chip({ children, onRemove, className = '', ...props }: ChipProps) { return <span className={`sanui-chip ${className}`.trim()} {...props}>{children}{onRemove && <button type="button" aria-label={`Remove ${typeof children === 'string' ? children : 'item'}`} onClick={onRemove}>×</button>}</span> }
