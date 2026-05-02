import React from 'react';

// Three simple, distinguishable body silhouette SVGs (chudy / sredni / gruby)
const baseProps = {
  viewBox: '0 0 48 96',
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'currentColor',
};

export const SilhouetteThin = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="24" cy="10" r="7" />
    <path d="M22 18 h4 l3 22 l-2 32 h-6 l-2 -32 z" />
    <path d="M17 22 l-4 18 l3 2 l4 -16 z" />
    <path d="M31 22 l4 18 l-3 2 l-4 -16 z" />
    <path d="M20 72 l-1 20 h3 l2 -20 z" />
    <path d="M28 72 l1 20 h-3 l-2 -20 z" />
  </svg>
);

export const SilhouetteAverage = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="24" cy="10" r="8" />
    <path d="M20 18 h8 l6 24 l-3 30 h-14 l-3 -30 z" />
    <path d="M14 22 l-5 20 l4 3 l5 -18 z" />
    <path d="M34 22 l5 20 l-4 3 l-5 -18 z" />
    <path d="M18 72 l-2 22 h4 l3 -22 z" />
    <path d="M30 72 l2 22 h-4 l-3 -22 z" />
  </svg>
);

export const SilhouetteHeavy = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="24" cy="11" r="9" />
    <path d="M16 20 h16 q10 5 10 22 l-4 24 h-28 l-4 -24 q0 -17 10 -22 z" />
    <path d="M10 26 l-7 20 l5 4 l6 -16 z" />
    <path d="M38 26 l7 20 l-5 4 l-6 -16 z" />
    <path d="M17 72 l-3 22 h5 l3 -22 z" />
    <path d="M31 72 l3 22 h-5 l-3 -22 z" />
  </svg>
);

export const BODY_TYPES = [
  { value: 'chudy', label: 'Szczupły', Icon: SilhouetteThin },
  { value: 'sredni', label: 'Średni', Icon: SilhouetteAverage },
  { value: 'gruby', label: 'Silny', Icon: SilhouetteHeavy },
];
