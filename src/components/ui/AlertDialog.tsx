import * as React from 'react';
import { Button } from './Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './Dialog';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive';
  children?: React.ReactNode;
}

export const AlertDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Ya',
  cancelText = 'Batal',
  onConfirm,
  variant = 'default',
  children,
}: AlertDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children && <div className="p-4 pb-0">{children}</div>}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelText}</Button>
        <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { onConfirm(); onOpenChange(false); }}>
          {confirmText}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);