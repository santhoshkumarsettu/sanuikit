import type { HTMLAttributes, ReactNode } from 'react'
export interface A11yAnnouncementProps extends HTMLAttributes<HTMLDivElement> { children: ReactNode; politeness?: 'polite' | 'assertive' }
export function A11yAnnouncement({ children, politeness = 'polite', ...props }: A11yAnnouncementProps) { return <div className="sanui-visually-hidden" role="status" aria-live={politeness} aria-atomic="true" {...props}>{children}</div> }
