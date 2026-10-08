import { useId, useState } from 'react';
import { t } from '../i18n';
import { ARMENIAN_LINE, Pelmen } from './Logo';

/**
 * The logo putting itself together: the blue disc pops in, the three dumplings fly into place,
 * the ring draws, the two lines of lettering swing in, the heart lands. Then it rests.
 * Tapping it plays the assembly again. All of it is CSS (see `.assembly` in components.css)
 * and is switched off under prefers-reduced-motion, where the finished logo is simply shown.
 */
export function LogoAssembly() {
  const id = useId();
  const dough = `${id}-dough`;
  const arcTop = `${id}-top`;
  const arcBottom = `${id}-bottom`;
  // Remounting the drawing restarts every animation in it.
  const [run, setRun] = useState(0);

  return (
    <button type="button" className="assembly" aria-label={t.home.replayLogo} onClick={() => setRun((n) => n + 1)}>
      <svg key={run} className="assembly__svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={dough} cx="40%" cy="30%" r="80%">
            <stop offset="0" stopColor="#fff3d6" />
            <stop offset=".6" stopColor="#f3d6a0" />
            <stop offset="1" stopColor="#dfb673" />
          </radialGradient>
          <path id={arcTop} d="M 72,200 A 128,128 0 0 1 328,200" />
          <path id={arcBottom} d="M 32,200 A 168,168 0 0 0 368,200" />
        </defs>

        <circle className="assembly__disc" cx="200" cy="200" r="194" fill="#a9cfe6" />
        <circle className="assembly__ring" cx="200" cy="200" r="184" fill="none" stroke="#8fb9d4" strokeWidth="2" pathLength={1} />

        <g className="assembly__text assembly__text--top">
          <text className="logo__arc" fontSize="27" letterSpacing="1">
            <textPath href={`#${arcTop}`} startOffset="50%" textAnchor="middle">
              {t.brand.toUpperCase()}
            </textPath>
          </text>
        </g>

        {/* Outer group: where the dumpling ends up. Inner group: the flight that brings it there. */}
        <g transform="translate(152,238) rotate(-14) scale(.86)">
          <g className="assembly__pelmen assembly__pelmen--left">
            <Pelmen fill={`url(#${dough})`} />
          </g>
        </g>
        <g transform="translate(248,238) rotate(14) scale(.86)">
          <g className="assembly__pelmen assembly__pelmen--right">
            <Pelmen fill={`url(#${dough})`} />
          </g>
        </g>
        <g transform="translate(200,172) scale(1.02)">
          <g className="assembly__pelmen assembly__pelmen--top">
            <Pelmen fill={`url(#${dough})`} />
          </g>
        </g>

        <path
          className="assembly__heart"
          fill="#6b3f1d"
          d="M200,306 c-3,-5 -10,-5 -10,1 c0,5 6,8 10,12 c4,-4 10,-7 10,-12 c0,-6 -7,-6 -10,-1 z"
        />

        <g className="assembly__text assembly__text--bottom">
          <text className="logo__arc" fontSize="25" letterSpacing="1.5">
            <textPath href={`#${arcBottom}`} startOffset="50%" textAnchor="middle">
              {ARMENIAN_LINE}
            </textPath>
          </text>
        </g>
      </svg>
    </button>
  );
}
