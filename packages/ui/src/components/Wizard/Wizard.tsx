import type { ReactNode } from 'react'
import { Button } from '../Button'
import { ProgressTracker } from '../ProgressTracker'
export interface WizardStep { label: string; content: ReactNode }
export interface WizardProps { steps: WizardStep[]; step: number; onStepChange: (step: number) => void; onFinish?: () => void; nextLabel?: string; backLabel?: string; finishLabel?: string }
export function Wizard({ steps, step, onStepChange, onFinish, nextLabel = 'Continue', backLabel = 'Back', finishLabel = 'Finish' }: WizardProps) { const current = steps[step]; if (!current) return null; const last = step === steps.length - 1; return <section className="sanui-wizard"><ProgressTracker steps={steps.map(({ label }) => ({ label }))} currentStep={step} /><div className="sanui-wizard__content">{current.content}</div><footer className="sanui-wizard__actions"><Button variant="secondary" disabled={step === 0} onClick={() => onStepChange(step - 1)}>{backLabel}</Button>{last ? <Button onClick={onFinish}>{finishLabel}</Button> : <Button onClick={() => onStepChange(step + 1)}>{nextLabel}</Button>}</footer></section> }
