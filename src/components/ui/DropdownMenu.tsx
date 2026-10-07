import * as React from 'react';
import { cn } from '@/utils/format';
import { ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

const DropdownMenu = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
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
    <DropdownMenuContext.Provider value={contextValue}>
      <div className={cn('relative inline-block', className)} {...props}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
};
DropdownMenu.displayName = 'DropdownMenu';

const useDropdownMenu = () => {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error('DropdownMenu components must be used within DropdownMenu');
  return context;
};

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ children, className, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useDropdownMenu();
    return (
      <Button
        ref={(el) => { triggerRef.current = el; if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el; }}
        variant="outline"
        onClick={() => setOpen(!open)}
        className={cn('gap-1', className)}
        {...props}
      >
        {children}
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </Button>
    )
  }
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, align = 'end', ...props }, ref) => {
    const { open, contentRef } = useDropdownMenu();
    if (!open) return null;
    const alignClasses = {
      start: 'left-0',
      center: 'left-1/2 -translate-x-1/2',
      end: 'right-0',
    };
    return (
      <div
        ref={(el) => { contentRef.current = el; if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
        className={cn(
          'absolute z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800',
          'animate-in fade-in-0 zoom-in-95 duration-150',
          alignClasses[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { inset?: boolean }>(
  ({ inset, className, onClick, children, ...props }, ref) => (
    <button
      ref={ref}
      onClick={(e) => { onClick?.(e); setTimeout(() => { /* close handled by parent */ }, 0); }}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        'focus:bg-gray-100 dark:focus:bg-gray-700',
        inset && 'pl-8',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuLabel = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-2 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100', className)} {...props}>
    {children}
  </div>
);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
  <hr className={cn('h-px my-1 bg-gray-200 dark:bg-gray-700', className)} {...props} />
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };