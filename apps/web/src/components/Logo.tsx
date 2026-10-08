import { useId } from 'react';
import { t } from '../i18n';

// The round badge is redrawn from the logo used in the brand film (intro.html / film end card).
// TODO_CLIENT: replace with the original logo file (assets/logo.*, ideally SVG) when Алексей sends it,
// and confirm the Armenian line.
const ARMENIAN_LINE = 'Ալյոշա Պելմենիչ';

const PELMEN_BODY =
  'M-42,6 C-46,-28 -20,-44 0,-44 C20,-44 46,-28 42,6 C40,26 21,36 9,27 C5,33 -5,33 -9,27 C-21,36 -40,26 -42,6 Z';

function Pelmen({ fill, transform }: { fill: string; transform: string }) {
  return (
    <g transform={transform}>
      <path d={PELMEN_BODY} fill={fill} stroke="#7a4a1e" strokeWidth="3.5" strokeLinejoin="round" />
      <g fill="none" stroke="#7a4a1e" strokeWidth="2.6" strokeLinecap="round">
        <path d="M0,25 C-2,10 -10,-4 -22,-12" />
        <path d="M0,25 C0,8 0,-6 0,-20" />
        <path d="M0,25 C2,10 10,-4 22,-12" />
        <path d="M-9,26 C-16,18 -24,12 -32,10" />
        <path d="M9,26 C16,18 24,12 32,10" />
      </g>
    </g>
  );
}

export function LogoBadge({ className }: { className?: string }) {
  const id = useId();
  const dough = `${id}-dough`;
  const arcTop = `${id}-top`;
  const arcBottom = `${id}-bottom`;

  return (
    <svg className={className} viewBox="0 0 400 400" role="img" aria-label={t.brand}>
      <defs>
        <radialGradient id={dough} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff3d6" />
          <stop offset=".6" stopColor="#f3d6a0" />
          <stop offset="1" stopColor="#dfb673" />
        </radialGradient>
        <path id={arcTop} d="M 72,200 A 128,128 0 0 1 328,200" />
        <path id={arcBottom} d="M 32,200 A 168,168 0 0 0 368,200" />
      </defs>
      <circle cx="200" cy="200" r="194" fill="#a9cfe6" />
      <circle cx="200" cy="200" r="184" fill="none" stroke="#8fb9d4" strokeWidth="2" />
      <text className="logo__arc" fontSize="27" letterSpacing="1">
        <textPath href={`#${arcTop}`} startOffset="50%" textAnchor="middle">
          {t.brand.toUpperCase()}
        </textPath>
      </text>
      <Pelmen fill={`url(#${dough})`} transform="translate(152,238) rotate(-14) scale(.86)" />
      <Pelmen fill={`url(#${dough})`} transform="translate(248,238) rotate(14) scale(.86)" />
      <Pelmen fill={`url(#${dough})`} transform="translate(200,172) scale(1.02)" />
      <path
        fill="#6b3f1d"
        d="M200,306 c-3,-5 -10,-5 -10,1 c0,5 6,8 10,12 c4,-4 10,-7 10,-12 c0,-6 -7,-6 -10,-1 z"
      />
      <text className="logo__arc" fontSize="25" letterSpacing="1.5">
        <textPath href={`#${arcBottom}`} startOffset="50%" textAnchor="middle">
          {ARMENIAN_LINE}
        </textPath>
      </text>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoBadge className="logo__mark" />
      <span className="logo__text" aria-hidden="true">
        {t.brand}
      </span>
    </span>
  );
}
