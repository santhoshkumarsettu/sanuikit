import Link from 'next/link'
import { Badge, Button } from 'sanui'
import { demoProject, demoUnits, formatCurrency } from '@vstudio/utils'
import { AppShell } from '../components/app-shell'

const available = demoUnits.filter(unit => unit.status === 'AVAILABLE').length
const reserved = demoUnits.filter(unit => unit.status === 'RESERVED').length
const sold = demoUnits.filter(unit => unit.status === 'SOLD').length

export default function DashboardPage() {
  const occupancy = Math.round((demoUnits.length - available) / demoUnits.length * 100)
  return <AppShell><div className="dashboard-page">
    <div className="page-title-row"><div><p className="page-eyebrow">Sunday, October 11, 2026 · Workspace overview</p><h1 className="page-title">Good morning, San.</h1><p className="page-subtitle">Here’s what’s happening across your property portfolio.</p></div><div className="title-actions"><Link className="sanui-button sanui-button--secondary sanui-button--md" href="/reports">Export report</Link><Link className="sanui-button sanui-button--primary sanui-button--md" href="/projects/new">＋ New project</Link></div></div>
    <section className="overview-grid" aria-label="Portfolio metrics">
      <article className="stat-card"><div className="stat-top"><span>Active projects</span><span className="stat-glyph">⌂</span></div><div className="stat-value">08</div><div className="stat-foot"><span className="trend-up">+2</span> from last month</div></article>
      <article className="stat-card"><div className="stat-top"><span>Total units</span><span className="stat-glyph">▤</span></div><div className="stat-value">1,284</div><div className="stat-foot"><span className="trend-up">+86</span> added this quarter</div></article>
      <article className="stat-card"><div className="stat-top"><span>Available inventory</span><span className="stat-glyph">◉</span></div><div className="stat-value">{available + 326}</div><div className="stat-foot">{occupancy}% allocated across projects</div></article>
      <article className="stat-card"><div className="stat-top"><span>Bookings this month</span><span className="stat-glyph">▣</span></div><div className="stat-value">42</div><div className="stat-foot"><span className="trend-up">+12.8%</span> vs. previous month</div></article>
    </section>
    <div className="dashboard-main-grid">
      <section className="surface-card"><header className="surface-header"><div><h2>Projects</h2><p>Your most recently updated developments</p></div><Link className="text-link" href="/projects">View all projects →</Link></header><div className="surface-body">
        <Link className="project-row" href="/projects/green-valley"><div className="project-name"><span className="project-thumb" /><span><strong>{demoProject.name}</strong><small>{demoProject.location} · {demoUnits.length} mapped units</small></span></div><span className="status-pill">Active</span><span>{available} available</span><span>2h ago</span></Link>
        <Link className="project-row" href="/projects/sunrise-residences"><div className="project-name"><span className="project-thumb" style={{ background: 'linear-gradient(135deg,#e7d9ca,#e7ebe0)' }} /><span><strong>Sunrise Residences</strong><small>Indiranagar, Bengaluru · 384 units</small></span></div><span className="status-pill">Active</span><span>212 available</span><span>Yesterday</span></Link>
        <Link className="project-row" href="/projects/orbit-tech-park"><div className="project-name"><span className="project-thumb" style={{ background: 'linear-gradient(135deg,#d9e2e7,#e9e4d7)' }} /><span><strong>Orbit Tech Park</strong><small>Outer Ring Road, Bengaluru · 120 units</small></span></div><span className="status-pill">Active</span><span>48 available</span><span>2 days ago</span></Link>
        <Link className="project-row" href="/projects/terrace-villas"><div className="project-name"><span className="project-thumb" style={{ background: 'linear-gradient(135deg,#e7dfd2,#d9e9d9)' }} /><span><strong>Terrace Villas</strong><small>Devanahalli, Bengaluru · 36 units</small></span></div><span className="status-pill">Draft</span><span>36 available</span><span>Oct 7</span></Link>
      </div></section>
      <section className="surface-card"><header className="surface-header"><div><h2>Recent activity</h2><p>Latest updates from your team</p></div><Button variant="ghost" size="sm" aria-label="More activity options">•••</Button></header><div className="surface-body">
        <div className="activity-item"><span className="activity-dot" /><div className="activity-copy"><strong>Priya Sharma</strong> reserved <strong>Plot A-102</strong><time>Today, 10:32 AM</time></div></div>
        <div className="activity-item"><span className="activity-dot" style={{ background: '#93a5d2' }} /><div className="activity-copy"><strong>Rahul Mehta</strong> updated prices in <strong>Sunrise Residences</strong><time>Today, 9:15 AM</time></div></div>
        <div className="activity-item"><span className="activity-dot" style={{ background: '#dcaa56' }} /><div className="activity-copy"><strong>You</strong> published <strong>Green Valley</strong> to the web<time>Yesterday, 4:48 PM</time></div></div>
        <div className="activity-item"><span className="activity-dot" style={{ background: '#94a297' }} /><div className="activity-copy"><strong>Arjun Rao</strong> imported 24 new units<time>Yesterday, 2:20 PM</time></div></div>
      </div></section>
    </div>
    <div className="dashboard-main-grid">
      <section className="surface-card"><header className="surface-header"><div><h2>Green Valley · Inventory snapshot</h2><p>Live unit status for your featured project</p></div><Link className="text-link" href="/inventory">Manage inventory →</Link></header><div className="surface-body"><div className="preview-row"><Badge tone="success">Available · {available}</Badge><Badge tone="warning">Reserved · {reserved}</Badge><Badge tone="info">Booked · {demoUnits.filter(unit => unit.status === 'BOOKED').length}</Badge><Badge>Sold · {sold}</Badge></div><div className="dashboard-progress"><span style={{ width: `${occupancy}%` }} /></div><div className="snapshot-caption"><span>{occupancy}% of plots allocated</span><Link className="text-link" href="/studio">Open Map Studio →</Link></div></div></section>
      <section className="surface-card"><header className="surface-header"><div><h2>Sales summary</h2><p>October 2026 · All projects</p></div></header><div className="surface-body"><div className="sales-total">{formatCurrency(124_800_000)}<small>value reserved this month</small></div><div className="sales-bars" aria-label="Weekly booking activity"><i style={{ height: '35%' }} /><i style={{ height: '54%' }} /><i style={{ height: '43%' }} /><i style={{ height: '73%' }} /><i style={{ height: '61%' }} /><i style={{ height: '89%' }} /><i style={{ height: '72%' }} /><i style={{ height: '96%' }} /></div></div></section>
    </div>
  </div></AppShell>
}
