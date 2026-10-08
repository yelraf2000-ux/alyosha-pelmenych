import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getProducts, getSettings } from '../api';
import type { Product, Settings } from '../types';

interface ShopState {
  products: Product[];
  settings: Settings | null;
  loading: boolean;
  error: boolean;
  /** Re-reads products (and stock) from the server. */
  refresh: () => Promise<void>;
}

const ShopContext = createContext<ShopState | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProducts(await getProducts());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProducts(), getSettings()])
      .then(([loadedProducts, loadedSettings]) => {
        if (cancelled) return;
        setProducts(loadedProducts);
        setSettings(loadedSettings);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ products, settings, loading, error, refresh }),
    [products, settings, loading, error, refresh],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopState {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside ShopProvider');
  return ctx;
}
