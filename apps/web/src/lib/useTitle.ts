import { useEffect } from 'react';
import { t } from '../i18n';

export function useTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${t.brand}` : t.brand;
  }, [title]);
}
