'use client'

import { useState } from 'react'
import {
  A11yAnnouncement, Alert, Badge, Banner, BottomSheet, Breadcrumb, Button, Callout, Card,
  Checkbox, Chip, Collapse, Container, DataTable, Divider, ErrorMessage, FocusTrap, FormGroup,
  Grid, IconButton, LineClamp, Link, List, LivingDesign, Menu, MenuItem, Metric, Modal, Nudge,
  Panel, Popover, ProgressIndicator, ProgressTracker, Radio, Rating, Select, SideNavigation,
  Skeleton, Snackbar, Spinner, SpotIcon, StyledText, Switch, TabNavigation, Tag, Text, TextArea,
  TextField, VisuallyHidden, Wizard, classNames, clamp, useControllableState, useMediaQuery, visuallyHiddenStyle,
} from 'sanui'

function Preview({ name, children }: { name: string; children: React.ReactNode }) {
  return <Card className="catalog-card"><div className="catalog-card__title"><span>{name}</span><code>{name}</code></div><div className="catalog-card__content">{children}</div></Card>
}

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) {
  return <section className="catalog-section" id={id}><div className="section-heading"><div><p className="eyebrow">{number} / Component family</p><h2>{title}</h2></div></div><div className="catalog-grid">{children}</div></section>
}

function CollapseDemo() {
  const [open, setOpen] = useState(false)
  return <div><Button variant="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide details' : 'Show details'}</Button><Collapse open={open}><p className="collapse-copy">This content expands and collapses while preserving its place in the page.</p></Collapse></div>
}

function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(true)
  const [rating, setRating] = useState(4)
  const [enabled, setEnabled] = useState(true)
  const [checked, setChecked] = useState(true)
  const [tab, setTab] = useState('overview')
  const [wizardStep, setWizardStep] = useState(0)
  const [exampleValue, setExampleValue] = useControllableState<boolean>(undefined, false)
  const isCompact = useMediaQuery('(max-width: 640px)')
  const tableRows = [{ name: 'Button', status: 'Ready' }, { name: 'Modal', status: 'In review' }]
  const wizardSteps = [{ label: 'Details', content: <TextField label="Project name" defaultValue="SanUI" /> }, { label: 'Review', content: <p>Review your project details before finishing.</p> }]

  return (
    <div className="playground">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SanUI home"><span className="brand-mark">S</span> sanui</a>
        <span className="version">COMPONENT PLAYGROUND <i /> v0.1</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A small system for good interfaces</p>
          <h1>Thoughtful pieces.<br /><em>Beautifully together.</em></h1>
          <p className="hero-description">SanUI is a growing set of accessible, themeable React components. Browse the catalog below and try each item in context.</p>
          <div className="hero-actions"><Button onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>Explore components <span aria-hidden="true">↓</span></Button><Button variant="secondary" onClick={() => setModalOpen(true)}>Design guidelines</Button></div>
          <div className="hero-meta"><span className="live-dot" /> React&nbsp; · &nbsp;TypeScript&nbsp; · &nbsp;{isCompact ? 'Compact preview' : 'Responsive preview'}</div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-core">S</div><span className="art-label label-one">DESIGN</span><span className="art-label label-two">SYSTEM</span><span className="art-spark">✳</span></div>
      </section>

      <nav className="catalog-nav" aria-label="Component families">
        <a href="#foundations">Foundations</a><a href="#forms">Forms</a><a href="#layout">Layout</a><a href="#navigation">Navigation</a><a href="#feedback">Feedback</a><a href="#overlays">Overlays</a><a href="#data">Data & display</a><a href="#workflow">Workflow</a>
      </nav>

      <div id="catalog">
        <Section id="foundations" number="01" title="Foundations & actions">
          <Preview name="Button"><div className="preview-row"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Quiet</Button><Button variant="danger">Destructive</Button></div><div className="preview-row"><Button size="sm">Small</Button><Button size="lg">Large</Button><Button disabled>Disabled</Button></div></Preview>
          <Preview name="IconButton"><div className="preview-row"><IconButton label="Add item" variant="primary">＋</IconButton><IconButton label="More options" variant="secondary">⋯</IconButton><IconButton label="Close">×</IconButton><VisuallyHidden>Icon buttons include accessible labels.</VisuallyHidden></div></Preview>
          <Preview name="Badge"><div className="preview-row"><Badge>Neutral</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge><Badge tone="info">Information</Badge></div></Preview>
          <Preview name="Chip"><div className="preview-row"><Chip>Design</Chip><Chip onRemove={() => undefined}>Removable filter</Chip></div></Preview>
          <Preview name="Tag"><div className="preview-row"><Tag>Default</Tag><Tag tone="primary">Primary</Tag><Tag tone="success">Approved</Tag><Tag tone="warning">Review</Tag></div></Preview>
          <Preview name="Divider"><div>Content above<Divider /><span>Horizontal divider</span><div className="preview-row">Left <Divider orientation="vertical" /> Right</div></div></Preview>
          <Preview name="SpotIcon"><div className="preview-row"><SpotIcon>✳</SpotIcon><SpotIcon tone="success">✓</SpotIcon><SpotIcon tone="warning">!</SpotIcon><SpotIcon tone="danger">×</SpotIcon></div></Preview>
          <Preview name="StyledText"><div className="preview-stack"><StyledText as="span" size="sm">Small label</StyledText><StyledText as="p" size="lg" weight="semibold">Styled text with a clear hierarchy</StyledText></div></Preview>
          <Preview name="Text"><div className="preview-stack"><Text size="lg">Readable body copy</Text><Text muted size="sm">Supporting text</Text></div></Preview>
          <Preview name="VisuallyHidden"><div>Screen-reader-only text is included for assistive technology.<VisuallyHidden>This content is announced by screen readers.</VisuallyHidden></div></Preview>
          <Preview name="A11yAnnouncement"><div><A11yAnnouncement>Saved successfully.</A11yAnnouncement><span className="preview-note">A live announcement is ready for assistive technology.</span></div></Preview>
          <Preview name="Link"><div className="preview-stack"><Link href="#forms">Internal link to forms</Link><Link href="https://example.com" external>External link example</Link></div></Preview>
          <Preview name="LineClamp"><LineClamp lines={2}>This paragraph demonstrates line clamping. It is longer than the available space so the component truncates the content after the configured number of lines while keeping the full text in the document.</LineClamp></Preview>
        </Section>

        <Section id="forms" number="02" title="Form controls">
          <Preview name="TextField"><TextField label="Email address" placeholder="you@example.com" hint="We’ll only use this to get in touch." /></Preview>
          <Preview name="TextArea"><TextArea label="Message" placeholder="Write a few words…" rows={3} hint="A short description works best." /></Preview>
          <Preview name="Select"><Select label="Choose a workspace" placeholder="Select one" options={[{ value: 'design', label: 'Design' }, { value: 'engineering', label: 'Engineering' }, { value: 'product', label: 'Product' }]} /></Preview>
          <Preview name="Checkbox"><Checkbox label="Send me product updates" checked={checked} onChange={event => setChecked(event.target.checked)} hint="You can unsubscribe any time." /></Preview>
          <Preview name="Radio"><FormGroup label="Choose a plan"><div className="preview-stack"><Radio name="plan" label="Starter" value="starter" defaultChecked /><Radio name="plan" label="Team" value="team" /></div></FormGroup></Preview>
          <Preview name="Switch"><Switch label="Enable notifications" checked={enabled} onChange={event => setEnabled(event.target.checked)} /></Preview>
          <Preview name="FormGroup"><FormGroup label="Contact preference" hint="Select how we should reach you."><div className="preview-row"><Radio name="contact" label="Email" value="email" defaultChecked /><Radio name="contact" label="Phone" value="phone" /></div></FormGroup></Preview>
          <Preview name="ErrorMessage"><div className="preview-stack"><TextField label="Work email" defaultValue="not-an-email" error="Enter a valid email address." /><ErrorMessage>This field needs your attention.</ErrorMessage></div></Preview>
        </Section>

        <Section id="layout" number="03" title="Layout & composition">
          <Preview name="Container"><Container size="sm" className="container-demo">A centered content container</Container></Preview>
          <Preview name="Grid"><Grid columns={2} gap="10px"><div className="grid-tile">One</div><div className="grid-tile">Two</div><div className="grid-tile">Three</div><div className="grid-tile">Four</div></Grid></Preview>
          <Preview name="Card"><Card className="nested-card"><strong>A content card</strong><p>Cards group related information.</p></Card></Preview>
          <Preview name="Panel"><Panel title="Account overview" actions={<Button size="sm" variant="ghost">Edit</Button>}><p className="no-margin">A panel with a heading, action, and body region.</p></Panel></Preview>
          <Preview name="List"><List items={['Accessible by default', 'Themeable with tokens', 'Built for React']} /></Preview>
          <Preview name="Collapse"><CollapseDemo /></Preview>
          <Preview name="LivingDesign"><LivingDesign title="Living design" description="An example section wrapper."><p className="no-margin">Design documentation can live alongside component examples.</p></LivingDesign></Preview>
        </Section>

        <Section id="navigation" number="04" title="Navigation & wayfinding">
          <Preview name="Breadcrumb"><Breadcrumb items={[{ label: 'Home', href: '#' }, { label: 'Components', href: '#catalog' }, { label: 'Breadcrumb' }]} /></Preview>
          <Preview name="SideNavigation"><SideNavigation items={[{ label: 'Overview', href: '#catalog', active: true }, { label: 'Settings', href: '#forms' }, { label: 'Members', href: '#data' }]} /></Preview>
          <Preview name="Menu"><Menu label="Actions"><MenuItem onClick={() => undefined}>Edit item</MenuItem><MenuItem onClick={() => undefined}>Duplicate</MenuItem><MenuItem onClick={() => undefined}>Archive</MenuItem></Menu></Preview>
          <Preview name="TabNavigation"><TabNavigation value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview', content: <p className="no-margin">A quick summary of your workspace.</p> }, { id: 'activity', label: 'Activity', content: <p className="no-margin">Recent activity appears here.</p> }]} /></Preview>
        </Section>

        <Section id="feedback" number="05" title="Feedback & status">
          <Preview name="Alert"><div className="preview-stack"><Alert title="Information">Your changes are saved.</Alert><Alert tone="warning" title="Heads up">One item needs review.</Alert></div></Preview>
          <Preview name="Banner"><Banner tone="success">Your workspace is ready to use.</Banner></Preview>
          <Preview name="Callout"><Callout title="A helpful tip" icon="✳">Use consistent spacing to create rhythm.</Callout></Preview>
          <Preview name="Nudge"><Nudge title="Quick tip" dismissible={false}>Try the compact button size for dense toolbars.</Nudge></Preview>
          <Preview name="Snackbar"><div className="preview-row"><Button size="sm" variant="secondary" onClick={() => setSnackbarOpen(true)}>Show notification</Button><span className="preview-note">A notification is also shown at the bottom right.</span></div></Preview>
          <Preview name="ProgressIndicator"><div className="preview-stack"><ProgressIndicator value={68} label="Upload progress" /><span className="preview-note">68% complete</span></div></Preview>
          <Preview name="ProgressTracker"><ProgressTracker currentStep={1} steps={[{ label: 'Account' }, { label: 'Profile' }, { label: 'Finish' }]} /></Preview>
          <Preview name="Rating"><Rating value={rating} onChange={setRating} label="Rate this component" /></Preview>
          <Preview name="Spinner"><div className="preview-row"><Spinner label="Loading data" size="sm" /><Spinner label="Loading content" /><Spinner label="Loading page" size="lg" /></div></Preview>
          <Preview name="Skeleton"><div className="preview-stack"><Skeleton width="75%" /><Skeleton variant="rectangular" height={42} /><Skeleton variant="circular" width={36} height={36} /></div></Preview>
          <Preview name="Metric"><div className="preview-row"><Metric label="Components" value="49" change="+6 this week" /></div></Preview>
        </Section>

        <Section id="overlays" number="06" title="Overlays & contextual content">
          <Preview name="Modal"><Button onClick={() => setModalOpen(true)}>Open modal</Button></Preview>
          <Preview name="BottomSheet"><Button variant="secondary" onClick={() => setSheetOpen(true)}>Open bottom sheet</Button></Preview>
          <Preview name="Popover"><Popover trigger="What’s this?">A small contextual explanation anchored to its trigger.</Popover></Preview>
          <Preview name="FocusTrap"><FocusTrap active={false}><Button variant="secondary">Focus trap region</Button></FocusTrap></Preview>
        </Section>

        <Section id="data" number="07" title="Data & content display">
          <Preview name="DataTable"><DataTable caption="Component status" columns={[{ key: 'name', header: 'Component' }, { key: 'status', header: 'Status', render: row => <Badge tone={row.status === 'Ready' ? 'success' : 'warning'}>{row.status}</Badge> }]} rows={tableRows} getRowKey={row => row.name} /></Preview>
          <Preview name="Text and clamp"><div className={classNames('preview-stack', 'text-preview')}><Text size="lg">SanUI helps teams build consistently.</Text><LineClamp lines={2}>Shared components reduce repeated work and give interfaces a coherent visual language as products grow.</LineClamp></div></Preview>
          <Preview name="Utility helpers"><div className="preview-stack"><code>clamp(120, 0, 100) → {clamp(120, 0, 100)}</code><code>classNames('sanui', 'ready') → {classNames('sanui', 'ready')}</code><span style={visuallyHiddenStyle()}>Utility helpers can support accessible custom patterns.</span></div></Preview>
          <Preview name="Hooks"><div className="preview-row"><Button variant="secondary" onClick={() => setExampleValue(!exampleValue)}>Toggle value</Button><span>useControllableState: {String(exampleValue)}</span></div></Preview>
        </Section>

        <Section id="workflow" number="08" title="Multi-step workflows">
          <Preview name="Wizard"><Wizard steps={wizardSteps} step={wizardStep} onStepChange={setWizardStep} onFinish={() => setWizardStep(0)} /></Preview>
        </Section>
      </div>

      <footer><span>SanUI <span className="footer-dot">✳</span> An open canvas for your product.</span><span>DESIGNED TO GROW WITH YOU</span></footer>

      <Modal open={modalOpen} title="Design guidelines" onClose={() => setModalOpen(false)} footer={<Button onClick={() => setModalOpen(false)}>Got it</Button>}>
        <p>SanUI components use shared tokens for color, spacing, radii, and focus states. Start with accessible defaults, then adapt the tokens to your product.</p>
      </Modal>
      <BottomSheet open={sheetOpen} title="Component details" onClose={() => setSheetOpen(false)}>
        <p>Bottom sheets keep a focused task close at hand, especially on mobile layouts.</p><Button onClick={() => setSheetOpen(false)}>Done</Button>
      </BottomSheet>
      <Snackbar open={snackbarOpen} onClose={() => setSnackbarOpen(false)}>Preview interactions are ready.</Snackbar>
    </div>
  )
}

export default App
