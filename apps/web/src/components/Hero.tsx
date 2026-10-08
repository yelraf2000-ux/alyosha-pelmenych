import type { Settings } from '../types';

/**
 * The top of the home page: the title and the line under it, both from the settings.
 * On wide screens the logo stands above them until the page is scrolled (the header's doing).
 */
export function Hero({ settings }: { settings: Settings }) {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <h1>{settings.heroTitle}</h1>
        {settings.heroSubtitle && <p className="hero__subtitle">{settings.heroSubtitle}</p>}
      </div>
    </section>
  );
}
