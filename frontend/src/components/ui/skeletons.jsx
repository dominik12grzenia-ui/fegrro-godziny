import React from 'react';

/**
 * Skeleton bloki - placeholdery imitujace ksztalt docelowej tresci.
 * Daja wrazenie "szybciej" niz zwykly spinner bo UI nie skacze podczas ladowania.
 */

const shimmer = {
  background: 'linear-gradient(90deg, #1E293B 0%, #2A384C 50%, #1E293B 100%)',
  backgroundSize: '200% 100%',
  animation: 'fegrro-shimmer 1.4s ease-in-out infinite',
};

if (typeof document !== 'undefined' && !document.getElementById('fegrro-shimmer-css')) {
  const s = document.createElement('style');
  s.id = 'fegrro-shimmer-css';
  s.textContent = '@keyframes fegrro-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'
    + '.no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}'
    + '.no-spinner{-moz-appearance:textfield;appearance:textfield}';
  document.head.appendChild(s);
}

export const SkeletonBox = ({ className = '', style = {} }) => (
  <div className={`rounded ${className}`} style={{ ...shimmer, ...style }} aria-hidden="true" />
);

export const SkeletonText = ({ width = '100%', height = 14, className = '' }) => (
  <SkeletonBox className={className} style={{ width, height }} />
);

export const SkeletonTable = ({ rows = 6, cols = 5, testid = 'skeleton-table' }) => (
  <div className="space-y-2" data-testid={testid}>
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBox key={`h${i}`} style={{ height: 28 }} />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBox key={`r${r}c${c}`} style={{ height: 36 }} />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCards = ({ count = 4, testid = 'skeleton-cards' }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid={testid}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-[#1E293B] border border-[#334155] rounded p-4 space-y-2">
        <SkeletonText width="60%" />
        <SkeletonBox style={{ height: 28, width: '40%' }} />
      </div>
    ))}
  </div>
);

export const SkeletonList = ({ rows = 5, testid = 'skeleton-list' }) => (
  <div className="space-y-2" data-testid={testid}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 bg-[#1E293B] border border-[#334155] rounded p-3">
        <SkeletonBox style={{ width: 48, height: 48, borderRadius: 6 }} />
        <div className="flex-1 space-y-2">
          <SkeletonText width="40%" />
          <SkeletonText width="70%" height={10} />
        </div>
        <SkeletonBox style={{ width: 80, height: 28 }} />
      </div>
    ))}
  </div>
);
