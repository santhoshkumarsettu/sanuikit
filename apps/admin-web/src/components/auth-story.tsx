import Link from 'next/link'

export function AuthStory() {
  return (
    <section className="auth-story" aria-label="VStudio workspace overview">
      <Link href="/" className="vstudio-brand auth-brand">
        <span className="vstudio-logo">V</span> VStudio
      </Link>
      <div className="auth-story-copy">
        <p className="auth-story-eyebrow">PROPERTY, IN FULL VIEW</p>
        <h2>Every space.<br />Clearly mapped.</h2>
        <p>Bring your layouts and inventory together in one workspace built for the way property teams work.</p>
      </div>
      <div className="auth-map-preview" aria-hidden="true">
        <div className="map-preview-top"><span>GREEN VALLEY</span><span>PHASE 01</span></div>
        <div className="map-preview-grid">
          <span className="map-plot plot-available">A-01</span><span className="map-plot plot-reserved">A-02</span><span className="map-plot plot-available">A-03</span><span className="map-plot plot-sold">A-04</span>
          <span className="map-road">GREENWAY AVENUE</span>
          <span className="map-plot plot-available">B-01</span><span className="map-plot plot-available">B-02</span><span className="map-plot plot-booked">B-03</span><span className="map-plot plot-available">B-04</span>
          <span className="map-plot plot-sold">C-01</span><span className="map-plot plot-available">C-02</span><span className="map-plot plot-available">C-03</span><span className="map-plot plot-available">C-04</span>
        </div>
        <div className="map-preview-caption"><span><i /> Available</span><span><i /> Reserved</span><span><i /> Sold</span></div>
        <div className="auth-map-stat"><span className="auth-stat-icon">↗</span><span><strong>Inventory at a glance</strong><small>Live project availability</small></span><b>84%</b></div>
      </div>
      <p className="auth-story-foot">A clearer view of every project.</p>
    </section>
  )
}
