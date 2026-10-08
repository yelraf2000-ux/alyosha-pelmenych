import { formatAmd, smallImagePath, type AdminProduct, type AdminStockRequest } from '@alyosha/shared';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { plural } from '../lib/format';
import { adminApi } from './api';
import { ContactLinks, errorText, LoadState, PageHead, useLoad } from './shared';

/** People waiting for a product, keyed by product id. Shown right after its stock is raised from zero. */
type WaitingMap = Record<number, AdminStockRequest[]>;

export interface ProductsLocationState {
  waiting?: { productId: number; requests: AdminStockRequest[] };
}

/** SPEC §7: «N человек ждут этот товар» with their contacts, and a way to mark them as notified. */
function WaitingHint({
  requests,
  onNotified,
  onHide,
}: {
  requests: AdminStockRequest[];
  onNotified: () => Promise<void>;
  onHide: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const n = requests.length;
  return (
    <div className="adm-waiting" role="status">
      <p>
        <strong>
          {n} {plural(n, ['человек ждёт', 'человека ждут', 'человек ждут'])} этот товар.
        </strong>{' '}
        Сообщите им, что он снова в наличии:
      </p>
      <ul>
        {requests.map((request) => (
          <li key={request.id}>
            <span>{request.name}</span>
            <ContactLinks phone={request.phone} telegram={request.telegram} />
          </li>
        ))}
      </ul>
      <div className="adm-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onNotified().finally(() => setBusy(false));
          }}
        >
          Отметить, что сообщили
        </button>
        <button type="button" className="btn" onClick={onHide}>
          Позже
        </button>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  position,
  total,
  waiting,
  onSaved,
  onMove,
  onError,
  onWaiting,
}: {
  product: AdminProduct;
  position: number;
  total: number;
  waiting: AdminStockRequest[] | undefined;
  onSaved: (product: AdminProduct) => void;
  onMove: (direction: -1 | 1) => void;
  onError: (message: string) => void;
  onWaiting: (requests: AdminStockRequest[] | null) => void;
}) {
  const [stock, setStock] = useState(String(product.stockQty));
  const [busy, setBusy] = useState(false);

  // The stock may change under us: an order came in, or the list was refreshed.
  useEffect(() => setStock(String(product.stockQty)), [product.stockQty]);

  const stockValue = /^\d+$/.test(stock.trim()) ? Number(stock) : null;
  const stockChanged = stockValue !== null && stockValue !== product.stockQty;

  async function save(patch: { stockQty?: number; isActive?: boolean; isNew?: boolean }) {
    setBusy(true);
    try {
      const result = await adminApi.updateProduct(product.id, patch);
      onSaved(result.product);
      if (result.waiting.length > 0) onWaiting(result.waiting);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`adm-product${product.isActive ? '' : ' adm-product--hidden'}`}>
      <div className="adm-product__top">
        {product.imagePath ? (
          <img className="adm-product__thumb" src={smallImagePath(product.imagePath)} alt="" loading="lazy" />
        ) : (
          <span className="adm-product__thumb adm-product__thumb--empty">нет фото</span>
        )}
        <div className="adm-product__info">
          <Link to={String(product.id)} className="adm-product__name">
            {product.name}
          </Link>
          <span className="adm-muted">
            {t.categories[product.category]}
            {product.weightLabel && ` · ${product.weightLabel}`} · {formatAmd(product.priceAmd)}
          </span>
          <span className="adm-tags">
            {!product.isActive && <span className="adm-tag">скрыт</span>}
            {product.isNew && <span className="adm-tag adm-tag--new">новинка</span>}
            {product.stockQty === 0 && <span className="adm-tag adm-tag--out">нет в наличии</span>}
            {product.waitingCount > 0 && (
              <Link to="/admin/requests" className="adm-tag adm-tag--wait">
                ждут: {product.waitingCount}
              </Link>
            )}
          </span>
        </div>
        <div className="adm-product__order">
          <button type="button" aria-label="Выше" disabled={position === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="Ниже" disabled={position === total - 1} onClick={() => onMove(1)}>
            ↓
          </button>
        </div>
      </div>

      <div className="adm-product__controls">
        <label className="adm-stock">
          <span>На складе</span>
          <span className="adm-stock__field">
            <button
              type="button"
              aria-label="Меньше"
              disabled={stockValue === null || stockValue <= 0}
              onClick={() => setStock(String((stockValue ?? 0) - 1))}
            >
              −
            </button>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={stock}
              aria-invalid={stockValue === null || undefined}
              onChange={(event) => setStock(event.target.value)}
            />
            <button type="button" aria-label="Больше" onClick={() => setStock(String((stockValue ?? 0) + 1))}>
              +
            </button>
          </span>
        </label>
        {stockChanged && (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => save({ stockQty: stockValue })}>
            Сохранить
          </button>
        )}
        <label className="adm-check">
          <input
            type="checkbox"
            checked={product.isActive}
            disabled={busy}
            onChange={(event) => save({ isActive: event.target.checked })}
          />
          На сайте
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={product.isNew}
            disabled={busy}
            onChange={(event) => save({ isNew: event.target.checked })}
          />
          Новинка
        </label>
        <Link to={String(product.id)} className="btn adm-product__edit">
          Изменить
        </Link>
      </div>

      {waiting && waiting.length > 0 && (
        <WaitingHint
          requests={waiting}
          onHide={() => onWaiting(null)}
          onNotified={async () => {
            try {
              await adminApi.markNotified(product.id);
              onSaved({ ...product, waitingCount: 0 });
              onWaiting(null);
            } catch (reason) {
              onError(errorText(reason));
            }
          }}
        />
      )}
    </li>
  );
}

export function ProductsPage() {
  const location = useLocation();
  const { data: products, setData, error, loading, reload } = useLoad(() => adminApi.products(), [], {
    refreshOnFocus: true,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<WaitingMap>(() => {
    // The product form hands over who is waiting when it raised the stock from zero.
    const passed = (location.state as ProductsLocationState | null)?.waiting;
    return passed ? { [passed.productId]: passed.requests } : {};
  });

  async function move(index: number, direction: -1 | 1) {
    if (!products) return;
    const next = [...products];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved!);
    setData(next); // show the new order at once
    try {
      setData(await adminApi.reorderProducts(next.map((product) => product.id)));
      setActionError(null);
    } catch (reason) {
      setActionError(errorText(reason));
      reload();
    }
  }

  return (
    <>
      <PageHead title="Товары">
        <Link to="new" className="btn btn--primary">
          + Добавить
        </Link>
      </PageHead>

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!products ? (
        <LoadState error={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <p className="adm-muted">Товаров пока нет. Добавьте первый.</p>
      ) : (
        <ul className={`adm-list${loading ? ' adm-list--loading' : ''}`}>
          {products.map((product, index) => (
            <ProductRow
              key={product.id}
              product={product}
              position={index}
              total={products.length}
              waiting={waiting[product.id]}
              onMove={(direction) => move(index, direction)}
              onError={setActionError}
              onSaved={(saved) => {
                setActionError(null);
                setData(products.map((item) => (item.id === saved.id ? saved : item)));
              }}
              onWaiting={(requests) =>
                setWaiting((current) => {
                  const next = { ...current };
                  if (requests) next[product.id] = requests;
                  else delete next[product.id];
                  return next;
                })
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
