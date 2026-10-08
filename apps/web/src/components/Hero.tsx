import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n';
import type { Settings } from '../types';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  );
}

export { PlayIcon };

export function Hero({ settings, onWatchFilm }: { settings: Settings; onWatchFilm: () => void }) {
  const heroRef = useRef<HTMLElement>(null);
  const [videoOn, setVideoOn] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // The still frame is what loads first. The looping clip (about 0.9 MB) is fetched after the page
  // has loaded, and not at all under prefers-reduced-motion or the browser's data-saver mode.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduceMotion || saveData) return;

    const start = () => setVideoOn(true);
    if (document.readyState === 'complete') {
      const timer = setTimeout(start, 200);
      return () => clearTimeout(timer);
    }
    window.addEventListener('load', start, { once: true });
    return () => window.removeEventListener('load', start);
  }, []);

  // Slight pointer parallax on the picture. Desktop pointers only.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    if (!window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;

    let frame = 0;
    function onMove(event: PointerEvent) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = hero!.getBoundingClientRect();
        hero!.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
        hero!.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
      });
    }
    hero.addEventListener('pointermove', onMove);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="hero" ref={heroRef}>
      <div className="hero__media" aria-hidden="true">
        <img src="/media/hero-poster.webp" alt="" width={1280} height={720} {...{ fetchpriority: 'high' }} />
        {videoOn && (
          <video
            className={videoReady ? 'is-ready' : undefined}
            src="/media/hero-loop.mp4"
            autoPlay
            muted
            loop
            playsInline
            onCanPlay={() => setVideoReady(true)}
          />
        )}
      </div>
      <div className="hero__shade" aria-hidden="true" />
      <div className="container hero__inner">
        <p className="hero__tag">
          <span aria-hidden="true">✦</span> {t.home.tagline}
        </p>
        <h1>{settings.heroTitle}</h1>
        <p className="hero__subtitle">{settings.heroSubtitle}</p>
        <div className="hero__actions">
          <Link to="/catalog" className="btn btn--primary btn--lg">
            {t.home.heroCta}
          </Link>
          <button type="button" className="btn btn--glass btn--lg" onClick={onWatchFilm}>
            <PlayIcon />
            {t.home.watchFilm}
          </button>
        </div>
      </div>
    </section>
  );
}
