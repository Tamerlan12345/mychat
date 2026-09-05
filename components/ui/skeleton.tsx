import React from 'react';

/** Neutral loading placeholder; sized by the caller through className. */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} />
);
