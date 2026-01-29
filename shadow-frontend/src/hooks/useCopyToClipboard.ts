import { useState, useCallback } from 'react';
import { COPY_NOTIFICATION_DELAY } from '../constants/ui';

export function useCopyToClipboard(timeout = COPY_NOTIFICATION_DELAY) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    } catch (error) {
      // Silently fail - copy functionality is a nice-to-have feature
      // Only log in development mode for debugging
      if (import.meta.env.DEV) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  }, [timeout]);

  return { copied, copy };
}
