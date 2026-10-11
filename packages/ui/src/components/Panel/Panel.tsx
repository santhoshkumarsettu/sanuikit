import type { HTMLAttributes, ReactNode } from 'react'
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> { title?: ReactNode; actions?: ReactNode; children: ReactNode }
export function Panel({ title, actions, children, className = '', ...props }: PanelProps) { return <section className={`sanui-panel ${className}`.trim()} {...props}>{(title || actions) && <header className="sanui-panel__header">{title && <h2>{title}</h2>}{actions}</header>}<div className="sanui-panel__body">{children}</div></section> }
