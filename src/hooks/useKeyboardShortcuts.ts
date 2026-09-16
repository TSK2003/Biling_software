import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onSearch?: () => void;
  onPayment?: () => void;
  onNewBill?: () => void;
  onPrint?: () => void;
  onEscape?: () => void;
  onIncreaseQty?: () => void;
  onDecreaseQty?: () => void;
  onAddSelected?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers = {}) => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in standard inputs unless it's a specific control key
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // 1. Ctrl + B -> Navigate to Billing
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        navigate('/billing');
        return;
      }

      // 2. Ctrl + N -> New Bill / Reset Cart
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handlers.onNewBill?.();
        return;
      }

      // 3. Ctrl + P -> Print receipt
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlers.onPrint?.();
        return;
      }

      // 4. Ctrl + F or F2 -> Focus Product Search
      if ((e.ctrlKey && (e.key === 'f' || e.key === 'F')) || e.key === 'F2') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // 5. F4 -> Trigger Payment Modal
      if (e.key === 'F4') {
        e.preventDefault();
        handlers.onPayment?.();
        return;
      }

      // 6. Escape -> Close modal or blur input
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        if (isInput) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // 7. '+' / '-' -> Increase or decrease quantity if not typing in text input
      if (!isInput) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          handlers.onIncreaseQty?.();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          handlers.onDecreaseQty?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, handlers]);
};
