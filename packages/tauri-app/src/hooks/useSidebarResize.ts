import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';

const ACTIVITY_BAR_WIDTH = 48;

export function useSidebarResize() {
  const [isResizing, setIsResizing] = useState(false);
  const setSidebarWidth = useAppStore((state) => state.setSidebarWidth);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX - ACTIVITY_BAR_WIDTH;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return {
    isResizing,
    handleResizeStart,
  };
}
