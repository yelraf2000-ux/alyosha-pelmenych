import { formatKg, type AdminCustomOrder, type OrderStatus } from '@alyosha/shared';
import { useState } from 'react';
import { adminApi } from './api';
import { ContactLinks, errorText, formatDateTime, LoadState, PageHead, StatusBadge, useLoad } from './shared';

const ACTIONS: { status: OrderStatus; label: string }[] = [
  { status: 'confirmed', label: 'Подтвердить' },
  { status: 'done', label: 'Выполнен' },
  { status: 'new', label: 'Вернуть в новые' },
  { status: 'cancelled', label: 'Отменить' },
];

function RecipeCard({
  order,
  onChanged,
  onError,
}: {
  order: AdminCustomOrder;
  onChanged: (order: AdminCustomOrder) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: OrderStatus) {
    setBusy(true);
    onError(null);
    try {
      onChanged(await adminApi.setCustomOrderStatus(order.id, status));
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const list = (options: string[]) => (options.length > 0 ? options.join(', ') : '—');

  return (
    <li className="adm-card adm-recipe">
      <div className="adm-recipe__head">
        <span className="adm-row__main">
          <strong>{order.publicNumber}</strong>
          <StatusBadge status={order.status} />
        </span>
        <span className="adm-muted">{formatDateTime(order.createdAt)}</span>
      </div>
      <p className="adm-recipe__name">
        «{order.recipeName}» · {formatKg(order.weightGrams)}
      </p>
      <dl className="adm-recipe__parts">
        <div>
          <dt>Основа</dt>
          <dd>{order.base}</dd>
        </div>
        <div>
          <dt>Начинка</dt>
          <dd>{list(order.modifiers)}</dd>
        </div>
        <div>
          <dt>Специи</dt>
          <dd>{list(order.spices)}</dd>
        </div>
      </dl>
      <p>
        <strong>{order.customerName}</strong>
      </p>
      <ContactLinks phone={order.customerPhone} telegram={order.customerTelegram} />
      <p className="adm-muted">
        {order.telegramLinked
          ? 'Покупатель подключил бота: о смене статуса ему придёт сообщение в Telegram.'
          : 'Бота покупатель не подключил: о заказе сообщите ему сами.'}
      </p>
      {order.comment && <p className="adm-recipe__comment">«{order.comment}»</p>}
      <div className="adm-actions">
        {ACTIONS.filter((action) => action.status !== order.status).map((action) => (
          <button
            key={action.status}
            type="button"
            className={action.status === 'cancelled' ? 'btn adm-danger' : action.status === 'confirmed' || action.status === 'done' ? 'btn btn--primary' : 'btn'}
            disabled={busy}
            onClick={() => setStatus(action.status)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </li>
  );
}

/** «Свой рецепт» requests: what the buyer put together and how to reach them. There is no price here. */
export function CustomOrdersPage() {
  const { data: orders, setData, error, reload } = useLoad(() => adminApi.customOrders(), [], { refreshOnFocus: true });
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <>
      <PageHead title="Свои рецепты" />
      <p className="adm-muted">
        Заявки со страницы «Свой рецепт». Цены на сайте нет: назовите её покупателю, когда будете подтверждать заказ. Что можно
        выбрать, настраивается в «Настройках».
      </p>

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!orders ? (
        <LoadState error={error} onRetry={reload} />
      ) : orders.length === 0 ? (
        <p className="adm-muted">Заявок пока нет.</p>
      ) : (
        <ul className="adm-list">
          {orders.map((order) => (
            <RecipeCard
              key={order.id}
              order={order}
              onError={setActionError}
              onChanged={(changed) => setData(orders.map((item) => (item.id === changed.id ? changed : item)))}
            />
          ))}
        </ul>
      )}
    </>
  );
}
