import { formatAmd, ORDER_STATUSES, type AdminOrderSummary, type OrderStatus, type StockShortage } from '@alyosha/shared';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi, ApiError } from './api';
import { ContactLinks, errorText, formatDateTime, LoadState, PageHead, StatusBadge, useLoad } from './shared';

const FILTERS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'confirmed', label: 'Подтверждённые' },
  { value: 'done', label: 'Выполненные' },
  { value: 'cancelled', label: 'Отменённые' },
];

function readStatus(value: string | null): OrderStatus | undefined {
  return (ORDER_STATUSES as readonly string[]).includes(value ?? '') ? (value as OrderStatus) : undefined;
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = readStatus(params.get('status'));

  const first = useLoad(() => adminApi.orders(status, 0), [status], { refreshOnFocus: true });
  // Pages after the first one, added by «Показать ещё».
  const [more, setMore] = useState<AdminOrderSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    setMore([]);
    setMoreError(null);
    setHasMore(first.data?.hasMore ?? false);
  }, [first.data]);

  const orders = first.data ? [...first.data.orders, ...more] : null;

  async function loadMore() {
    if (!orders) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await adminApi.orders(status, orders.length);
      setMore((current) => [...current, ...page.orders]);
      setHasMore(page.hasMore);
    } catch (reason) {
      setMoreError(errorText(reason));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHead title="Заказы">
        <Link to="stats" className="btn">
          Статистика
        </Link>
      </PageHead>

      <div className="chips" role="group" aria-label="Статус">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`chip${(status ?? '') === filter.value ? ' chip--active' : ''}`}
            aria-pressed={(status ?? '') === filter.value}
            onClick={() => setParams(filter.value ? { status: filter.value } : {})}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {!orders ? (
        <LoadState error={first.error} onRetry={first.reload} />
      ) : orders.length === 0 ? (
        <p className="adm-muted">Здесь пока нет заказов.</p>
      ) : (
        <ul className="adm-list">
          {orders.map((order) => (
            <li key={order.id}>
              <Link to={String(order.id)} className="adm-row">
                <span className="adm-row__main">
                  <strong>{order.publicNumber}</strong>
                  <StatusBadge status={order.status} />
                </span>
                <span className="adm-row__sub">
                  {order.customerName} · {order.deliveryMethod === 'pickup' ? 'самовывоз' : 'курьер'} · {order.itemsCount}{' '}
                  шт.
                </span>
                <span className="adm-row__side">
                  <strong>{formatAmd(order.totalAmd)}</strong>
                  <span className="adm-muted">{formatDateTime(order.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {moreError && <p className="alert alert--error">{moreError}</p>}
      {orders && hasMore && (
        <button type="button" className="btn btn--block" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
    </>
  );
}

/** Whether the buyer hears about status changes from the shop's Telegram bot. */
const BOT_ON = 'Покупатель подключил бота: о смене статуса ему придёт сообщение в Telegram.';
const BOT_OFF = 'Бота покупатель не подключил: о заказе сообщите ему сами.';

const ACTIONS: { status: OrderStatus; label: string }[] = [
  { status: 'confirmed', label: 'Подтвердить' },
  { status: 'done', label: 'Выполнен' },
  { status: 'new', label: 'Вернуть в новые' },
  { status: 'cancelled', label: 'Отменить заказ' },
];

export function OrderPage() {
  const id = Number(useParams().id);
  const { data: order, setData, error, reload } = useLoad(() => adminApi.order(id), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<StockShortage[]>([]);

  if (!order) {
    return (
      <>
        <Link to=".." relative="path" className="adm-back">
          ← Все заказы
        </Link>
        <LoadState error={error} onRetry={reload} />
      </>
    );
  }

  async function change(status: OrderStatus) {
    if (!order) return;
    if (status === 'cancelled' && !window.confirm('Отменить заказ? Товары из него вернутся на склад.')) return;
    if (order.status === 'cancelled' && !window.confirm('Вернуть заказ в работу? Товары снова спишутся со склада.')) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setShortages([]);
    try {
      const result = await adminApi.setOrderStatus(order.id, status);
      setData(result.order);
    } catch (reason) {
      setActionError(errorText(reason));
      if (reason instanceof ApiError && reason.body?.shortages) setShortages(reason.body.shortages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to=".." relative="path" className="adm-back">
        ← Все заказы
      </Link>
      <PageHead title={`Заказ ${order.publicNumber}`}>
        <StatusBadge status={order.status} />
      </PageHead>
      <p className="adm-muted">Оформлен {formatDateTime(order.createdAt)}</p>

      <section className="adm-card">
        <h2>Статус</h2>
        <div className="adm-actions">
          {ACTIONS.filter((action) => action.status !== order.status).map((action) => (
            <button
              key={action.status}
              type="button"
              className={`btn${action.status === 'cancelled' ? ' adm-danger' : action.status === 'confirmed' && order.status === 'new' ? ' btn--primary' : ''}`}
              disabled={busy}
              onClick={() => change(action.status)}
            >
              {action.label}
            </button>
          ))}
        </div>
        {actionError && (
          <div className="alert alert--error" role="alert">
            <p>{actionError}</p>
            {shortages.length > 0 && (
              <ul>
                {shortages.map((shortage) => (
                  <li key={shortage.productId}>
                    {shortage.name}: на складе {shortage.available} шт.
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="adm-card">
        <h2>Покупатель</h2>
        <p className="adm-big">{order.customerName}</p>
        <ContactLinks phone={order.customerPhone} telegram={order.customerTelegram} />
        <p className="adm-muted">{order.telegramLinked ? BOT_ON : BOT_OFF}</p>
        {order.comment && (
          <p className="adm-note">
            <span className="adm-muted">Комментарий:</span> {order.comment}
          </p>
        )}
      </section>

      <section className="adm-card">
        <h2>{order.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка курьером'}</h2>
        {order.deliveryAddress && <p className="adm-big">{order.deliveryAddress}</p>}
      </section>

      <section className="adm-card">
        <h2>Состав</h2>
        <table className="adm-table">
          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId}>
                <td>
                  {item.name}
                  <span className="adm-muted">
                    {' '}
                    × {item.qty} по {formatAmd(item.priceAmd)}
                  </span>
                </td>
                <td className="adm-num">{formatAmd(item.priceAmd * item.qty)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Товары</td>
              <td className="adm-num">{formatAmd(order.itemsTotalAmd)}</td>
            </tr>
            <tr>
              <td>Доставка</td>
              <td className="adm-num">
                {order.deliveryExtra
                  ? 'отдельно, курьеру'
                  : order.deliveryFeeAmd === 0
                    ? 'бесплатно'
                    : formatAmd(order.deliveryFeeAmd)}
              </td>
            </tr>
            <tr className="adm-total">
              <td>Итого</td>
              <td className="adm-num">
                {formatAmd(order.totalAmd)}
                {order.deliveryExtra && ' + доставка'}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  );
}
