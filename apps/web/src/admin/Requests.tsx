import type { StockRequestStatus } from '@alyosha/shared';
import { useState } from 'react';
import { adminApi } from './api';
import { ContactLinks, errorText, formatDateTime, LoadState, PageHead, useLoad } from './shared';

const HANDLED_LABELS: Record<StockRequestStatus, string> = {
  open: 'ждёт',
  notified: 'сообщили',
  closed: 'закрыта',
};

/** «Сообщить о поступлении» requests, grouped by product (SPEC §7). */
export function RequestsPage() {
  const [showHandled, setShowHandled] = useState(false);
  const { data: groups, error, reload } = useLoad(() => adminApi.stockRequests(showHandled), [showHandled], {
    refreshOnFocus: true,
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      reload();
    } catch (reason) {
      setActionError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Заявки «Сообщить о поступлении»" />

      <label className="adm-check">
        <input type="checkbox" checked={showHandled} onChange={(event) => setShowHandled(event.target.checked)} />
        Показывать и тех, кому уже сообщили
      </label>

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!groups ? (
        <LoadState error={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <p className="adm-muted">Сейчас никто не ждёт поступления.</p>
      ) : (
        groups.map((group) => {
          const open = group.requests.filter((request) => request.status === 'open');
          return (
            <section key={group.product.id} className="adm-card">
              <div className="adm-head">
                <h2>{group.product.name}</h2>
                <span className={`adm-tag${group.product.stockQty > 0 ? ' adm-tag--new' : ' adm-tag--out'}`}>
                  {group.product.stockQty > 0 ? `на складе ${group.product.stockQty} шт.` : 'нет в наличии'}
                </span>
              </div>
              <ul className="adm-requests">
                {group.requests.map((request) => (
                  <li key={request.id}>
                    <div>
                      <strong>{request.name}</strong>{' '}
                      <span className="adm-muted">
                        {formatDateTime(request.createdAt)}
                        {request.status !== 'open' && ` · ${HANDLED_LABELS[request.status]}`}
                      </span>
                    </div>
                    <ContactLinks phone={request.phone} telegram={request.telegram} />
                    {request.status === 'open' && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={busy}
                        onClick={() => run(() => adminApi.setRequestStatus(request.id, 'notified'))}
                      >
                        Сообщили
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {open.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => run(() => adminApi.markNotified(group.product.id))}
                >
                  Отметить всех ({open.length}) как оповещённых
                </button>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
