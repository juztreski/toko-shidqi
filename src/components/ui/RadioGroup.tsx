import * as React from 'react';
import { cn } from '@/utils/format';

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}

const RadioGroupContext = React.createContext<{ value: string; onChange: (v: string) => void } | null>(null);

const RadioGroup = ({ value, onValueChange, defaultValue, children, className, ...props }: RadioGroupProps) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '');
  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;
  
  const handleChange = (v: string) => {
    if (!controlled) setInternalValue(v);
    onValueChange?.(v);
  };
  
  return (
    <RadioGroupContext.Provider value={{ value: currentValue, onChange: handleChange }}>
      <div className={cn('', className)} {...props}>{children}</div>
    </RadioGroupContext.Provider>
  );
};
RadioGroup.displayName = 'RadioGroup';

interface RadioGroupItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ value, disabled, children, className, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    if (!context) throw new Error('RadioGroupItem must be used within RadioGroup');
    
    const isSelected = context.value === value;
    
    return (
      <button
        ref={ref}
        role="radio"
        aria-checked={isSelected}
        aria-disabled={disabled}
        onClick={() => !disabled && context.onChange(value)}
        className={cn(
          'relative flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isSelected
            ? 'border-primary bg-primary/5 dark:border-primary dark:bg-primary/10'
            : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
          className
        )}
        {...props}
      >
        <div className={cn(
          'relative flex h-4 w-4 items-center justify-center rounded-full border-2',
          isSelected ? 'border-primary' : 'border-gray-300 dark:border-gray-600'
        )}>
          {isSelected && (
            <div className="h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        {children}
      </button>
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };