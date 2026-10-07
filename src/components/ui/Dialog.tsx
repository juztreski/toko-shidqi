import * as React from 'react';
import { cn } from '@/utils/format';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ className, children, open, onOpenChange, ...props }, ref) => {
    React.useEffect(() => {
      if (open) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }
      return () => { document.body.style.overflow = 'unset'; };
    }, [open]);

    return (
      <div className={cn('fixed inset-0 z-50', className)} {...props}>
        {open && (
          <>
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => onOpenChange?.(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                ref={ref}
                className={cn(
                  'relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800',
                  'animate-in fade-in zoom-in-95 duration-200'
                )}
              >
                {children}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
);
Dialog.displayName = 'Dialog';

const DialogTrigger = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <span onClick={onClick}>{children}</span>
);

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props}>
      {children}
    </div>
  )
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  )
);
DialogDescription.displayName = 'DialogDescription';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogClose = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <Button variant="ghost" size="icon" className={cn('absolute right-4 top-4', className)} {...props}>
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </Button>
);

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose };