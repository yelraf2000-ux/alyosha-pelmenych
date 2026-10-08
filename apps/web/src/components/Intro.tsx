import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { LogoAssembly } from './LogoAssembly';

/** The logo has put itself together by then (the timings are in components.css, `.assembly`). */
const ASSEMBLE_MS = 1900;
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
 * The entry animation: the logo assembles in the middle of the screen, then shrinks and flies to
 * its place in the header (`target`), while the page appears behind it. The header keeps its own
 * logo hidden until `onDone`, so there is only ever one logo on the screen.
 * A tap or any key sends the logo to the header straight away.
 */
export function Intro({ target, onDone }: { target: RefObject<HTMLElement>; onDone: () => void }) {
  const logo = useRef<HTMLDivElement>(null);
  // 'bare': the header's logo is waiting without its blue disc (the top of the home page on a
  // wide screen), so the disc fades away during the flight instead of vanishing on landing.
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

  useEffect(() => {
    if (flying) {
      const timer = window.setTimeout(onDone, FLIGHT_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(fly, ASSEMBLE_MS);
    window.addEventListener('keydown', fly);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', fly);
    };
  }, [flying, fly, onDone]);

  return (
    <div
      className={flying ? `intro intro--flying intro--${flying}` : 'intro'}
      aria-hidden="true"
      onClick={flying ? undefined : fly}
    >
      <div
        ref={logo}
        className="intro__logo"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform') onDone();
        }}
      >
        <LogoAssembly />
      </div>
    </div>
  );
}
