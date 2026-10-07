import * as React from 'react';
import { cn } from '@/utils/format';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={ref}
          className={cn(
            'peer h-6 w-11 shrink-0 rounded-full border-2 border-gray-300',
            'checked:bg-primary checked:border-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600',
            className
          )}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        <span className={cn(
          'pointer-events-none absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-lg',
          'transition-transform peer-checked:translate-x-5 dark:bg-gray-800'
        )} />
      </div>
    );
  }
);
Switch.displayName = 'Switch';
export { Switch };