import {
  categoryName,
  formatAmd,
  smallImagePath,
  type AdminProduct,
  type AdminStockRequest,
  type Category,
} from '@alyosha/shared';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

/** Parts of a row that do something of their own when pressed, so a press there never starts a drag. */
const INTERACTIVE = 'a, button, input, select, textarea, label';

function ProductRow({
  product,
  categories,
  position,
  total,
  dragging,
  waiting,
  onSaved,
  onMove,
  onDragStart,
  onError,
  onWaiting,
}: {
  product: AdminProduct;
  categories: Category[];
  position: number;
  total: number;
  dragging: boolean;
  waiting: AdminStockRequest[] | undefined;
  onSaved: (product: AdminProduct) => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: (event: ReactPointerEvent) => void;
  onError: (message: string) => void;
  onWaiting: (requests: AdminStockRequest[] | null) => void;
}) {
  return (
    <li
      className={`adm-product${product.isActive ? '' : ' adm-product--hidden'}${dragging ? ' adm-product--dragging' : ''}`}
      // With a mouse the row can be taken anywhere that is not a link, a button or a field.
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && !(event.target as Element).closest(INTERACTIVE)) onDragStart(event);
      }}
    >
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
            {categoryName(categories, product.category)}
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
        {/* The grip: the place to take the row by on a touch screen (a finger anywhere else scrolls
            the page), and the way to move it from the keyboard, with the up and down arrows. */}
        <button
          type="button"
          className="adm-product__grip"
          aria-label="Перетащите, чтобы изменить порядок (или стрелки вверх и вниз)"
          title="Перетащите, чтобы изменить порядок"
          onPointerDown={onDragStart}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && position > 0) {
              event.preventDefault();
              onMove(-1);
            } else if (event.key === 'ArrowDown' && position < total - 1) {
              event.preventDefault();
              onMove(1);
            }
          }}
        >
          <svg viewBox="0 0 16 24" width="16" height="24" aria-hidden="true" focusable="false">
            <g fill="currentColor">
              <circle cx="4" cy="5" r="1.8" />
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="4" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="4" cy="19" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </g>
          </svg>
        </button>
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
  // Only for the names shown in the rows; while they load, a row shows the category's slug.
  const { data: categories } = useLoad(() => adminApi.categories(), []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<WaitingMap>(() => {
    // The product form hands over who is waiting when it raised the stock from zero.
    const passed = (location.state as ProductsLocationState | null)?.waiting;
    return passed ? { [passed.productId]: passed.requests } : {};
  });

  const list = useRef<HTMLUListElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  async function saveOrder(next: AdminProduct[]) {
    setData(next); // show the new order at once
    try {
      setData(await adminApi.reorderProducts(next.map((product) => product.id)));
      setActionError(null);
    } catch (reason) {
      setActionError(errorText(reason));
      reload();
    }
  }

  /** One step up or down: the keyboard's way of moving a product. */
  function move(index: number, direction: -1 | 1) {
    if (!products) return;
    const next = [...products];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved!);
    void saveOrder(next);
  }

  /**
   * Dragging a product to a new place. The row follows the pointer by changing places with its
   * neighbours as it passes the middle of each; the new order is saved when it is let go.
   */
  function startDrag(event: ReactPointerEvent, id: number) {
    if (!products || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const startY = event.clientY;
    let order = products;
    let active = false;

    const onMove = (moveEvent: PointerEvent) => {
      // A press that barely moves is a click, not a drag.
      if (!active) {
        if (Math.abs(moveEvent.clientY - startY) < 6) return;
        active = true;
        setDraggingId(id);
        // The press may have started selecting text before it turned out to be a drag.
        window.getSelection()?.removeAllRanges();
      }
      moveEvent.preventDefault();

      const rows = Array.from(list.current?.children ?? []);
      let target = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return moveEvent.clientY < box.top + box.height / 2;
      });
      if (target === -1) target = rows.length;
      const from = order.findIndex((product) => product.id === id);
      const to = target > from ? target - 1 : target;
      if (from !== -1 && to !== from) {
        const next = [...order];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        order = next;
        setData(next);
      }

      // Near the top or bottom of the screen the page scrolls along.
      if (moveEvent.clientY < 80) window.scrollBy(0, -14);
      else if (moveEvent.clientY > window.innerHeight - 80) window.scrollBy(0, 14);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (!active) return;
      setDraggingId(null);
      if (order !== products) void saveOrder(order);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return (
    <>
      <PageHead title="Товары">
        <Link to="categories" className="btn">
          Категории
        </Link>
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
        <ul
          ref={list}
          className={`adm-list${loading ? ' adm-list--loading' : ''}${draggingId !== null ? ' adm-list--dragging' : ''}`}
        >
          {products.map((product, index) => (
            <ProductRow
              key={product.id}
              product={product}
              categories={categories ?? []}
              position={index}
              total={products.length}
              dragging={draggingId === product.id}
              waiting={waiting[product.id]}
              onMove={(direction) => move(index, direction)}
              onDragStart={(event) => startDrag(event, product.id)}
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
