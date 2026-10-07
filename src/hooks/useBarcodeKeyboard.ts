import { useEffect, useRef, useCallback } from 'react';

interface UseBarcodeKeyboardOptions {
  onBarcode: (code: string) => void;
  active?: boolean;
  timeout?: number;
}

export const useBarcodeKeyboard = ({ onBarcode, active = true, timeout = 100 }: UseBarcodeKeyboardOptions) => {
  const bufferRef = useRef<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    
    // Ignore if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // But still capture Enter in search input
      if (e.key === 'Enter' && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'search') {
        return;
      }
      // Allow barcode scanner input (fast typing)
      if (bufferRef.current.length > 0) {
        // Continue buffering
      } else {
        return;
      }
    }

    if (e.key === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      if (code.length >= 3) {
        const now = Date.now();
        if (code !== lastCodeRef.current || now - lastTimeRef.current > 2000) {
          lastCodeRef.current = code;
          lastTimeRef.current = now;
          onBarcode(code);
        }
      }
      return;
    }

    // Only capture printable characters
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      bufferRef.current += e.key;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        bufferRef.current = '';
      }, timeout);
    }
  }, [active, onBarcode, timeout]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleKeyDown]);
};