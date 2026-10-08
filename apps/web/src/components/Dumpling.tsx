import { useId } from 'react';
import type { Category } from '../types';

// Hand-drawn stand-ins used in the logo placeholder, the hero and the PLACEHOLDER product photos.

const STROKE = '#7a4a1e';

export function Dumpling({ kind = 'pelmeni', className }: { kind?: Category; className?: string }) {
  const gradientId = useId();
  const fill = `url(#${gradientId})`;

  return (
    <svg className={className} viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gradientId} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff1c4" />
          <stop offset="100%" stopColor="#f3d6a0" />
        </radialGradient>
      </defs>
      {kind === 'vareniki' ? (
        <>
          <path
            d="M-48,-4 C-40,-34 40,-34 48,-4 C44,22 -44,22 -48,-4 Z"
            fill={fill}
            stroke={STROKE}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <g fill="none" stroke={STROKE} strokeWidth="2.6" strokeLinecap="round">
            <path d="M-34,8 L-30,0" />
            <path d="M-20,13 L-18,5" />
            <path d="M-6,15 L-6,7" />
            <path d="M8,15 L8,7" />
            <path d="M22,13 L20,5" />
            <path d="M35,8 L31,0" />
          </g>
        </>
      ) : kind === 'manty' ? (
        <>
          <path
            d="M0,-42 C26,-40 44,-22 44,4 C44,28 24,40 0,40 C-24,40 -44,28 -44,4 C-44,-22 -26,-40 0,-42 Z"
            fill={fill}
            stroke={STROKE}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <g fill="none" stroke={STROKE} strokeWidth="2.6" strokeLinecap="round">
            <path d="M-22,-18 C-10,-10 10,-10 22,-18" />
            <path d="M-12,-4 C-6,6 6,6 12,-4" />
            <path d="M0,-12 L0,10" />
            <path d="M-26,8 C-20,2 -16,0 -12,-4" />
            <path d="M26,8 C20,2 16,0 12,-4" />
          </g>
        </>
      ) : (
        <>
          <path
            d="M-42,6 C-46,-28 -20,-44 0,-44 C20,-44 46,-28 42,6 C40,26 21,36 9,27 C5,33 -5,33 -9,27 C-21,36 -40,26 -42,6 Z"
            fill={fill}
            stroke={STROKE}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <g fill="none" stroke={STROKE} strokeWidth="2.6" strokeLinecap="round">
            <path d="M0,25 C-2,10 -10,-4 -22,-12" />
            <path d="M0,25 C0,8 0,-6 0,-20" />
            <path d="M0,25 C2,10 10,-4 22,-12" />
            <path d="M-9,26 C-16,18 -24,12 -32,10" />
            <path d="M9,26 C16,18 24,12 32,10" />
          </g>
        </>
      )}
    </svg>
  );
}
