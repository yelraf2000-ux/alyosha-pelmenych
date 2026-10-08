import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import type { Product } from '../types';
import { useShop } from './ShopContext';

const CART_KEY = 'ap_cart_v1';

interface StoredLine {
  productId: number;
  qty: number;
}

export interface CartLine {
  product: Product;
  qty: number;
  lineTotal: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  notice: string | null;
  qtyOf: (productId: number) => number;
  /** Adds up to `qty`, never more than is in stock. */
  add: (productId: number, qty: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  dismissNotice: () => void;
}

const CartContext = createContext<CartState | null>(null);

function loadCart(): StoredLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is StoredLine =>
        typeof line === 'object' &&
        line !== null &&
        Number.isInteger((line as StoredLine).productId) &&
        Number.isInteger((line as StoredLine).qty) &&
        (line as StoredLine).qty > 0,
    );
  } catch {
    return [];
  }
}

function saveCart(items: StoredLine[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable: the cart lives until the tab is closed
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products, loading } = useShop();
  const [items, setItems] = useState<StoredLine[]>(loadCart);
  const [notice, setNotice] = useState<string | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Stock may have dropped since the cart was filled (another buyer, another tab).
  useEffect(() => {
    if (loading) return;
    let changed = false;
    const next = items.flatMap((line) => {
      const max = byId.get(line.productId)?.stockQty ?? 0;
      if (line.qty <= max) return [line];
      changed = true;
      return max > 0 ? [{ ...line, qty: max }] : [];
    });
    if (changed) {
      setItems(next);
      setNotice(t.cart.adjusted);
    }
  }, [items, byId, loading]);

  const add = useCallback(
    (productId: number, qty: number) => {
      const max = byId.get(productId)?.stockQty ?? 0;
      setItems((prev) => {
        const current = prev.find((line) => line.productId === productId)?.qty ?? 0;
        const nextQty = Math.min(max, current + qty);
        if (nextQty <= 0 || nextQty === current) return prev;
        return current === 0
          ? [...prev, { productId, qty: nextQty }]
          : prev.map((line) => (line.productId === productId ? { ...line, qty: nextQty } : line));
      });
    },
    [byId],
  );

  const setQty = useCallback(
    (productId: number, qty: number) => {
      const max = byId.get(productId)?.stockQty ?? 0;
      const nextQty = Math.max(1, Math.min(max, qty));
      setItems((prev) => prev.map((line) => (line.productId === productId ? { ...line, qty: nextQty } : line)));
    },
    [byId],
  );

  const remove = useCallback((productId: number) => {
    setItems((prev) => prev.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setNotice(null);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<CartState>(() => {
    const lines: CartLine[] = items.flatMap((line) => {
      const product = byId.get(line.productId);
      return product ? [{ product, qty: line.qty, lineTotal: product.priceAmd * line.qty }] : [];
    });
    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.qty, 0),
      subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      notice,
      qtyOf: (productId) => items.find((line) => line.productId === productId)?.qty ?? 0,
      add,
      setQty,
      remove,
      clear,
      dismissNotice,
    };
  }, [items, byId, notice, add, setQty, remove, clear, dismissNotice]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
