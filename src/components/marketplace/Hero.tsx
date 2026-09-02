"use client";

/**
 * Hero — matches the PALTAS prototype: full-bleed beach photo, welcome badge,
 * big headline, and a floating search bar (Where to / Check in / Check out /
 * Guests / Search). Purely presentational; the Search button scrolls to results.
 */
export function Hero() {
  return (
    <section className="hero">
      <div className="hero-photo" />
      <div className="hero-overlay" />
      <div className="hero-inner container">
        <span className="hero-badge">✦ Welcome to PALTAS</span>
        <h1 className="hero-title">
          Find your next<br />place to <span className="grad">stay.</span>
        </h1>
        <p className="hero-sub">Homes, apartments and unique stays<br />across Africa and beyond.</p>

        <div className="hero-search">
          <div className="hs-field">
            <div className="hs-ico">📍</div>
            <div>
              <label>Where to?</label>
              <div className="hs-val">Mombasa, Kenya</div>
            </div>
          </div>
          <div className="hs-divider" />
          <div className="hs-field">
            <div className="hs-ico">📅</div>
            <div>
              <label>Check in</label>
              <div className="hs-val">08 / 31 / 2026</div>
            </div>
          </div>
          <div className="hs-divider" />
          <div className="hs-field">
            <div className="hs-ico">📅</div>
            <div>
              <label>Check out</label>
              <div className="hs-val">09 / 04 / 2026</div>
            </div>
          </div>
          <div className="hs-divider" />
          <div className="hs-field">
            <div className="hs-ico">👤</div>
            <div>
              <label>Guests</label>
              <div className="hs-val">2 adults</div>
            </div>
          </div>
          <button
            className="hs-search-btn"
            onClick={() => document.querySelector(".marketplace")?.scrollIntoView({ behavior: "smooth" })}
          >
            🔍 Search
          </button>
        </div>
      </div>
    </section>
  );
}
