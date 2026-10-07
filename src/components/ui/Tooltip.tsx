import * as React from 'react';
import { cn } from '@/utils/format';

interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
  className?: string;
}

const Tooltip = ({ content, side = 'top', children, className }: TooltipProps) => {
  const [open, setOpen] = React.useState(false);
  
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };
  
  return (
    <div className={cn('relative inline-block', className)}>
      {React.cloneElement(children as React.ReactElement<any>, {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false)
      })}
      {open && (
        <div className={cn(
          'absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg',
          'animate-in fade-in zoom-in-95 duration-150',
          sideClasses[side]
        )}>
          {content}
        </div>
      )}
    </div>
  );
};
Tooltip.displayName = 'Tooltip';
export { Tooltip };