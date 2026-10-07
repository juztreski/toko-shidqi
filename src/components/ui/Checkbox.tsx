import * as React from 'react';
import { cn } from '@/utils/format';
import { Check } from 'lucide-react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        <input
          type="checkbox"
          ref={ref}
          className={cn(
            'peer h-4 w-4 shrink-0 rounded-sm border border-gray-300',
            'checked:bg-primary checked:border-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600',
            className
          )}
          checked={checked}
          {...props}
        />
        <span className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', 'peer-checked:block')}>
          <Check className="h-3.5 w-3.5 text-white" />
        </span>
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
export { Checkbox };