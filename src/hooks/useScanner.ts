import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, Result } from '@zxing/library';

interface UseScannerOptions {
  onScan: (code: string) => void;
  paused?: boolean;
  facingMode?: 'environment' | 'user';
}

export const useScanner = ({ onScan, paused = false, facingMode = 'environment' }: UseScannerOptions) => {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startScanner = useCallback((element: HTMLDivElement | null) => {
    if (!element || paused) return;
    
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    videoRef.current = video;
    element.appendChild(video);
    
    // Get the device ID for the facing mode
    let deviceId: string | undefined;
    if (facingMode === 'environment') {
      // We'll use the default device and let the library handle facing mode
      deviceId = undefined;
    }
    
    readerRef.current.decodeFromVideoDevice(
      deviceId,
      video,
      (result: Result | null) => {
        if (result) {
          const code = result.getText();
          setLastScanned(code);
          onScan(code);
          
          // Visual feedback
          video.style.border = '4px solid #22c55e';
          if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = window.setTimeout(() => {
            video.style.border = 'none';
            setLastScanned(null);
          }, 500);
        }
      }
    ).catch(err => {
      if (err.name !== 'NotAllowedError') {
        setError('Gagal mengakses kamera: ' + err.message);
      } else {
        setError('Izin kamera ditolak');
      }
      setHasPermission(false);
    });
    
    setHasPermission(true);
  }, [onScan, paused, facingMode]);

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current);
    }
    setHasPermission(false);
  }, []);

  useEffect(() => {
    if (paused) {
      stopScanner();
    }
    return () => stopScanner();
  }, [paused, stopScanner]);

  return { startScanner, stopScanner, lastScanned, hasPermission, error };
};