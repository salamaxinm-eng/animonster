import type { ReactNode } from 'react';

export type HalloweenNavKind = 'home' | 'catalog' | 'pass' | 'list' | 'profile';

function Pumpkin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M-1-10q-2-5 3-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M0-9C-18-17-19 12-7 13l7-2 7 2C19 12 18-17 0-9Z"
        fill="currentColor"
      />
      <path
        d="m-10-3 7 2-5 4Zm20 0-7 2 5 4ZM-9 6l5 1 4-3 4 3 5-1-5 5h-8Z"
        fill="#110d1b"
      />
    </g>
  );
}

export function HalloweenNavIcon({
  kind,
  children,
}: {
  kind: HalloweenNavKind;
  children: ReactNode;
}) {
  return (
    <span className="hw-nav-glyph" aria-hidden="true">
      <span className="hw-nav-default">{children}</span>
      <svg
        className={`hw-nav-seasonal hw-nav-${kind}`}
        viewBox="0 0 80 64"
        fill="none"
        focusable="false"
      >
        {kind === 'home' && (
          <>
            <circle cx="42" cy="28" r="25" fill="currentColor" />
            <path
              d="m8 56 5-31 7-10 7 10v7h7V17l7-14 8 14v13h8V19l5-9 6 10v36ZM5 58h70"
              fill="#110d1b"
              stroke="#110d1b"
              strokeWidth="2"
            />
            <path
              d="M37 58V43a5 5 0 0 1 10 0v15ZM18 29h4v7h-4Zm20-9h3v6h-3Zm6 0h3v6h-3Zm15 8h4v8h-4ZM18 42h4v6h-4Zm41 0h4v6h-4Z"
              fill="currentColor"
            />
            <path d="m59 7 5 1 3-3 2 4 6 1-5 3-4 1-4-3Z" fill="#110d1b" />
            <path
              d="M7 52 3 38m3 8 5-8m59 14 4-15m-2 7-5-5"
              stroke="#110d1b"
              strokeWidth="2"
            />
          </>
        )}
        {kind === 'catalog' && (
          <>
            <Pumpkin x={23} y={19} />
            <Pumpkin x={57} y={19} />
            <Pumpkin x={23} y={50} />
            <Pumpkin x={57} y={50} />
          </>
        )}
        {kind === 'pass' && (
          <>
            <path
              d="M35 25Q15 10 2 28q10-2 11 8 7-6 14 6Zm10 0Q65 10 78 28q-10-2-11 8-7-6-14 6Z"
              fill="currentColor"
              opacity=".72"
            />
            <path
              d="m13 6 13 4 37 39-8 7L18 18Zm54 0-13 4-37 39 8 7 37-38Z"
              fill="currentColor"
              stroke="#110d1b"
              strokeWidth="2"
            />
            <path
              d="m14 43 14 14m-8-7-8 10m54-17L52 57m8-7 8 10"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="m40 0 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="currentColor" />
          </>
        )}
        {kind === 'list' && (
          <>
            <path
              d="m27 5-10 17 10 37h26l10-37L53 5Z"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M40 17v28m-9-19h18"
              stroke="currentColor"
              strokeWidth="5"
            />
            <path
              d="m8 32 2 6 5 3-5 2-2 6-2-6-5-2 5-3Zm64-5 2 6 5 3-5 2-2 6-2-6-5-2 5-3Z"
              fill="currentColor"
            />
          </>
        )}
        {kind === 'profile' && (
          <>
            <path
              d="M40 5C10 5 12 39 24 43v13h9v-7h5v7h5v-7h5v7h9V43C69 39 70 5 40 5Z"
              fill="currentColor"
            />
            <path
              d="M25 29c0-9 12-9 12 0s-12 10-12 0Zm19 0c0-9 12-9 12 0s-12 10-12 0ZM40 35l-4 8h8Z"
              fill="#110d1b"
            />
            <path
              d="m9 32 2 6 6 3-6 2-2 6-2-6-6-2 6-3Zm62 0 2 6 6 3-6 2-2 6-2-6-6-2 6-3Z"
              fill="currentColor"
            />
          </>
        )}
      </svg>
    </span>
  );
}
