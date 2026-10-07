import * as React from 'react';
import { cn } from '@/utils/format';
import { Button } from './Button';

interface PopoverContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

const Popover = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (contentRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const contextValue = React.useMemo(() => ({ open, setOpen, triggerRef, contentRef }), [open, triggerRef, contentRef]);

  return (
    <PopoverContext.Provider value={contextValue}>
      <div className={cn('relative inline-block', className)} {...props}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
};
Popover.displayName = 'Popover';

const usePopover = () => {
  const context = React.useContext(PopoverContext);
  if (!context) throw new Error('Popover components must be used within Popover');
  return context;
};

interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const { open, setOpen, triggerRef } = usePopover();
    return (
      <Button
        ref={(el) => { triggerRef.current = el; if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el; }}
        variant="outline"
        onClick={() => setOpen(!open)}
        className={className}
        {...props}
      >
        {children}
      </Button>
    )
  }
);
PopoverTrigger.displayName = 'PopoverTrigger';

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ children, className, align = 'center', sideOffset = 4, ...props }, ref) => {
    const { open, contentRef } = usePopover();
    if (!open) return null;
    return (
      <div
        ref={(el) => { contentRef.current = el; if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
        className={cn(
          'absolute z-50 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800',
          'animate-in fade-in-0 zoom-in-95 duration-150',
          className
        )}
        style={{ marginTop: sideOffset }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };