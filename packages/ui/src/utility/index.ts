import type { CSSProperties } from 'react'

export function classNames(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' ') }
export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
export function visuallyHiddenStyle(): CSSProperties { return { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 } }
