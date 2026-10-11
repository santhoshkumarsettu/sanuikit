import type { HTMLAttributes } from 'react'
export interface ProgressIndicatorProps extends HTMLAttributes<HTMLDivElement> { value: number; max?: number; label?: string }
export function ProgressIndicator({ value, max = 100, label = 'Progress', className = '', ...props }: ProgressIndicatorProps) { const progress = Math.min(100, Math.max(0, value / max * 100)); return <div className={`sanui-progress ${className}`.trim()} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} {...props}><span style={{ width: `${progress}%` }} /></div> }
