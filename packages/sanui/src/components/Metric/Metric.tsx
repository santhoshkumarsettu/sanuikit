import type { HTMLAttributes, ReactNode } from 'react'
export interface MetricProps extends HTMLAttributes<HTMLDivElement> { label: string; value: ReactNode; change?: ReactNode }
export function Metric({ label, value, change, className = '', ...props }: MetricProps) { return <div className={`sanui-metric ${className}`.trim()} {...props}><span className="sanui-metric__label">{label}</span><strong className="sanui-metric__value">{value}</strong>{change != null && <span className="sanui-metric__change">{change}</span>}</div> }
