import { Link } from 'react-router-dom';
import { t } from '../i18n';
import type { Settings } from '../types';
import { LogoAssembly } from './LogoAssembly';

export function Hero({ settings }: { settings: Settings }) {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__art">
          <LogoAssembly />
        </div>
        <div className="hero__text">
          <h1>{settings.heroTitle}</h1>
          <p className="hero__subtitle">{settings.heroSubtitle}</p>
          <div className="hero__actions">
            <Link to="/catalog" className="btn btn--primary btn--lg">
              {t.home.heroCta}
            </Link>
            <Link to="/delivery" className="btn btn--lg">
              {t.home.heroSecondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
