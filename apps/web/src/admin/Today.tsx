import { Link } from 'react-router-dom';
import { adminApi } from './api';
import { LoadState, PageHead, useLoad } from './shared';

/** SPEC §7 "today view": how many orders are waiting and how much of each product they need. */
export function TodayPage() {
  const { data, error, reload } = useLoad(() => adminApi.today(), [], { refreshOnFocus: true });

  return (
    <>
      <PageHead title="Сегодня" />

      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <>
          {error && <p className="alert alert--error">{error}</p>}
          <div className="adm-stats">
            <Link to="/admin/orders?status=new" className={`adm-stat${data.newOrders > 0 ? ' adm-stat--hot' : ''}`}>
              <span className="adm-stat__value">{data.newOrders}</span>
              <span className="adm-stat__label">Новые заказы</span>
            </Link>
            <Link to="/admin/orders?status=confirmed" className="adm-stat">
              <span className="adm-stat__value">{data.confirmedOrders}</span>
              <span className="adm-stat__label">Подтверждённые</span>
            </Link>
            {/* «Свой рецепт» requests nobody has answered yet; the tile is there only when there are some. */}
            {data.newCustomOrders > 0 && (
              <Link to="/admin/recipes" className="adm-stat adm-stat--hot adm-stat--wide">
                <span className="adm-stat__value">{data.newCustomOrders}</span>
                <span className="adm-stat__label">Новые заявки «Свой рецепт»</span>
              </Link>
            )}
          </div>

          <section className="adm-card">
            <h2>Сколько нужно отдать</h2>
            <p className="adm-muted">По новым и подтверждённым заказам вместе.</p>
            {data.totals.length === 0 ? (
              <p>Активных заказов нет.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th className="adm-num">Штук</th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.name}</td>
                      <td className="adm-num">{row.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
