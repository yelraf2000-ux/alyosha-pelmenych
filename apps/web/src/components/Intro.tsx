import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Logo } from './Logo';

/** How long the logo stands in the middle of the screen before it leaves for the header. */
const HOLD_MS = 1500;
/** The logo's picture has this long to load; after that the page is shown without the greeting. */
const PICTURE_TIMEOUT_MS = 2500;
/** Longer than the flight itself: the way out if the browser never reports that it ended. */
const FLIGHT_TIMEOUT_MS = 1200;

/**
 * Whether to greet with the entry animation. It plays every time the site is opened or reloaded
 * (moving between its pages does not load it again), but never for people who asked their device
 * for less motion.
 */
export function shouldPlayIntro(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The entry animation: the logo appears big in the middle of the screen, then shrinks and flies
 * to its place in the header (`target`), while the page appears behind it. The header keeps its
 * own logo hidden until `onDone`, so there is only ever one logo on the screen.
 * A tap or any key sends the logo to the header straight away.
 */
export function Intro({ target, onDone }: { target: RefObject<HTMLElement>; onDone: () => void }) {
  const logo = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // 'bare': the header's logo is waiting without its blue background (the top of the home page
  // on a wide screen), so the blue fades away during the flight instead of vanishing on landing.
  const [flying, setFlying] = useState<false | 'whole' | 'bare'>(false);

  const fly = useCallback(() => {
    const from = logo.current?.getBoundingClientRect();
    const to = target.current?.getBoundingClientRect();
    if (!logo.current || !from || !to || to.width === 0) {
      onDone();
      return;
    }
    const style = logo.current.style;
    style.setProperty('--intro-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    style.setProperty('--intro-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    style.setProperty('--intro-scale', String(to.width / from.width));
    const disc = target.current?.querySelector('.logo__disc');
    setFlying(disc && getComputedStyle(disc).opacity === '0' ? 'bare' : 'whole');
  }, [target, onDone]);

  // The greeting starts when the picture is there to be seen.
  useEffect(() => {
    const picture = logo.current?.querySelector('img');
    if (!picture || picture.complete) {
      setShown(true);
      return;
    }
    const show = () => setShown(true);
    picture.addEventListener('load', show);
    const timer = window.setTimeout(onDone, PICTURE_TIMEOUT_MS);
    return () => {
      picture.removeEventListener('load', show);
      window.clearTimeout(timer);
    };
  }, [onDone]);

  useEffect(() => {
    if (!shown) return;
    if (flying) {
      const timer = window.setTimeout(onDone, FLIGHT_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(fly, HOLD_MS);
    window.addEventListener('keydown', fly);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', fly);
    };
  }, [shown, flying, fly, onDone]);

  const className = ['intro', shown && 'intro--shown', flying && `intro--flying intro--${flying}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} aria-hidden="true" onClick={flying || !shown ? undefined : fly}>
      <div
        ref={logo}
        className="intro__logo"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform') onDone();
        }}
      >
        <Logo bare />
      </div>
    </div>
  );
}
