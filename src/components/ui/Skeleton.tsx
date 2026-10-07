import * as React from 'react';
import { cn } from '@/utils/format';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700', className)}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';
export { Skeleton };