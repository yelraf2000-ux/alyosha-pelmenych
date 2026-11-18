import {
  addDays,
  daysInRange,
  formatAmd,
  isIsoDate,
  ORDER_STATUSES,
  shopToday,
  STATS_MAX_DAYS,
  type OrderStats,
} from '@alyosha/shared';
import { Link, useSearchParams } from 'react-router-dom';
import { plural } from '../lib/format';
import { adminApi } from './api';
import { LoadState, PageHead, StatusBadge, useLoad } from './shared';

const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });

/** "2026-10-09" → «пт, 9 октября». */
function formatDay(date: string): string {
  return dayLabel.format(new Date(`${date}T00:00:00Z`));
}

function ordersWord(count: number): string {
  return plural(count, ['заказ', 'заказа', 'заказов']);
}

/**
 * Statistics of the orders placed on one day or over a run of days: how many there were, how many
 * were cancelled, the money and what was sold. The period lives in the address (?from=…&to=…),
 * so the page can be reloaded or sent to oneself as it is.
 */
export function OrderStatsPage() {
  const [params, setParams] = useSearchParams();
  const today = shopToday();
  const fromParam = params.get('from');
  const toParam = params.get('to');
  // Anything missing or impossible in the address falls back to today.
  let from = isIsoDate(fromParam) && fromParam <= today ? fromParam : today;
  let to = isIsoDate(toParam) && toParam <= today ? toParam : from;
  if (to < from) [from, to] = [to, from];
  if (daysInRange(from, to) > STATS_MAX_DAYS) from = addDays(to, -(STATS_MAX_DAYS - 1));

  const { data, error, reload } = useLoad(() => adminApi.orderStats(from, to), [from, to], {
    refreshOnFocus: true,
  });
  // While another period is loading, the numbers on the screen are still the old period's.
  const stats: OrderStats | null = data && data.from === from && data.to === to ? data : null;

  const setPeriod = (nextFrom: string, nextTo: string) => setParams({ from: nextFrom, to: nextTo }, { replace: true });
  const presets = [
    { label: 'Сегодня', from: today, to: today },
    { label: 'Вчера', from: addDays(today, -1), to: addDays(today, -1) },
    { label: '7 дней', from: addDays(today, -6), to: today },
    { label: '30 дней', from: addDays(today, -29), to: today },
  ];
  const days = daysInRange(from, to);

  return (
    <>
      <Link to="/admin/orders" className="adm-back">
        ← Все заказы
      </Link>
      <PageHead title="Статистика" />

      <section className="adm-card adm-period">
        <div className="chips" role="group" aria-label="Период">
          {presets.map((preset) => {
            const active = preset.from === from && preset.to === to;
            return (
              <button
                key={preset.label}
                type="button"
                className={`chip${active ? ' chip--active' : ''}`}
                aria-pressed={active}
                onClick={() => setPeriod(preset.from, preset.to)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="adm-period__dates">
          <label>
            <span>С</span>
            <input
              type="date"
              value={from}
              max={today}
              // A day chosen after the end of the period becomes a one-day period.
              onChange={(event) => isIsoDate(event.target.value) && setPeriod(event.target.value, event.target.value > to ? event.target.value : to)}
            />
          </label>
          <label>
            <span>По</span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(event) => isIsoDate(event.target.value) && setPeriod(event.target.value < from ? event.target.value : from, event.target.value)}
            />
          </label>
        </div>
        <p className="adm-muted">
          {days === 1 ? formatDay(from) : `${formatDay(from)} — ${formatDay(to)}, ${days} ${plural(days, ['день', 'дня', 'дней'])}`}. Чтобы
          посмотреть один день, поставьте одну и ту же дату в оба поля.
        </p>
      </section>

      {!stats ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <>
          {error && <p className="alert alert--error">{error}</p>}

          <div className="adm-stats adm-stats--three">
            <div className="adm-stat">
              <span className="adm-stat__value">{stats.kept.count}</span>
              <span className="adm-stat__label">{ordersWord(stats.kept.count)} без отменённых</span>
            </div>
            <div className="adm-stat">
              <span className="adm-stat__value adm-stat__value--money">{formatAmd(stats.kept.totalAmd)}</span>
              <span className="adm-stat__label">на эту сумму</span>
            </div>
            <Link to="/admin/orders?status=cancelled" className={`adm-stat${stats.cancelled.count > 0 ? ' adm-stat--warn' : ''}`}>
              <span className="adm-stat__value">{stats.cancelled.count}</span>
              <span className="adm-stat__label">
                отменено{stats.cancelled.count > 0 && ` · на ${formatAmd(stats.cancelled.totalAmd)}`}
              </span>
            </Link>
          </div>

          {(stats.kept.count > 0 || stats.recipes.costedCount > 0 || stats.purchasesAmd > 0) && <ProfitCard stats={stats} />}

          {stats.placed.count === 0 ? (
            <p className="adm-muted">За этот период заказов не было.</p>
          ) : (
            <>
              <section className="adm-card">
                <h2>По статусам</h2>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Статус</th>
                      <th className="adm-num">Заказов</th>
                      <th className="adm-num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORDER_STATUSES.map((status) => (
                      <tr key={status}>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td className="adm-num">{stats.byStatus[status].count}</td>
                        <td className="adm-num">{formatAmd(stats.byStatus[status].totalAmd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="adm-total">
                      <td>Всего оформлено</td>
                      <td className="adm-num">{stats.placed.count}</td>
                      <td className="adm-num">{formatAmd(stats.placed.totalAmd)}</td>
                    </tr>
                  </tfoot>
                </table>
                <p className="adm-muted">
                  Самовывоз: {stats.pickupCount} · курьер: {stats.courierCount} (без отменённых).
                </p>
              </section>

              <section className="adm-card">
                <h2>Что продано</h2>
                {stats.products.length === 0 ? (
                  <p>Все заказы за этот период отменены.</p>
                ) : (
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th className="adm-num">Штук</th>
                        <th className="adm-num">Сумма</th>
                        <th className="adm-num">Прибыль</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.products.map((row) => (
                        <tr key={row.productId}>
                          <td>{row.name}</td>
                          <td className="adm-num">{row.qty}</td>
                          <td className="adm-num">{formatAmd(row.totalAmd)}</td>
                          <td className={`adm-num${row.profitAmd !== null && row.profitAmd < 0 ? ' adm-minus' : ''}`}>
                            {row.profitAmd === null ? '—' : formatAmd(row.profitAmd)}
                            {row.profitAmd !== null && row.costedQty < row.qty && '*'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {stats.products.some((row) => row.costedQty < row.qty) && (
                  <p className="adm-muted">
                    «—» — у товара не было состава, когда его заказали, и себестоимость не известна.
                    {stats.products.some((row) => row.profitAmd !== null && row.costedQty < row.qty) &&
                      ' * — прибыль только с тех штук, у которых состав был.'}{' '}
                    Состав задаётся в карточке товара.
                  </p>
                )}
                {stats.promoCodes.length > 0 && (
                  <p className="adm-muted">Суммы по товарам — по их ценам, до скидок по промокодам.</p>
                )}
              </section>

              {stats.promoCodes.length > 0 && (
                <section className="adm-card">
                  <h2>Промокоды</h2>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Промокод</th>
                        <th className="adm-num">Заказов</th>
                        <th className="adm-num">Скидка</th>
                        <th className="adm-num">Сумма заказов</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.promoCodes.map((row) => (
                        <tr key={row.code}>
                          <td>{row.code}</td>
                          <td className="adm-num">{row.count}</td>
                          <td className="adm-num">−{formatAmd(row.discountAmd)}</td>
                          <td className="adm-num">{formatAmd(row.totalAmd)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="adm-total">
                        <td>Всего скидок</td>
                        <td className="adm-num">{stats.promoCodes.reduce((total, row) => total + row.count, 0)}</td>
                        <td className="adm-num">−{formatAmd(stats.promoCodes.reduce((total, row) => total + row.discountAmd, 0))}</td>
                        <td className="adm-num">{formatAmd(stats.promoCodes.reduce((total, row) => total + row.totalAmd, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="adm-muted">Без отменённых заказов. «Сумма заказов» — сколько эти заказы стоили уже со скидкой.</p>
                </section>
              )}

              {days > 1 && (
                <section className="adm-card">
                  <h2>По дням</h2>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>День</th>
                        <th className="adm-num">Заказов</th>
                        <th className="adm-num">Отменено</th>
                        <th className="adm-num">Сумма</th>
                        <th className="adm-num">Прибыль</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.days.map((row) => (
                        <tr key={row.date}>
                          <td>
                            <Link to={`?from=${row.date}&to=${row.date}`}>{formatDay(row.date)}</Link>
                          </td>
                          <td className="adm-num">{row.count}</td>
                          <td className="adm-num">{row.cancelledCount}</td>
                          <td className="adm-num">{formatAmd(row.totalAmd)}</td>
                          <td className={`adm-num${row.profitAmd < 0 ? ' adm-minus' : ''}`}>{formatAmd(row.profitAmd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="adm-muted">Дни без заказов не показаны.</p>
                </section>
              )}
            </>
          )}

          {stats.recipes.count > 0 && (
            <section className="adm-card">
              <h2>Свой рецепт</h2>
              <table className="adm-table">
                <tbody>
                  <tr>
                    <td>Заявок (без отменённых)</td>
                    <td className="adm-num">{stats.recipes.count}</td>
                  </tr>
                  <tr>
                    <td>С ценой — на сумму</td>
                    <td className="adm-num">
                      {stats.recipes.pricedCount} · {formatAmd(stats.recipes.totalAmd)}
                    </td>
                  </tr>
                  {stats.recipes.costedCount > 0 && (
                    <tr>
                      <td>С себестоимостью — прибыль</td>
                      <td className="adm-num">
                        {stats.recipes.costedCount} · {formatAmd(stats.recipes.profitAmd)}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="adm-total">
                    <td>Всего: заказы и рецепты</td>
                    <td className="adm-num">{formatAmd(stats.kept.totalAmd + stats.recipes.totalAmd)}</td>
                  </tr>
                </tfoot>
              </table>
              {stats.recipes.pricedCount < stats.recipes.count && (
                <p className="adm-muted">Заявки без цены в сумму не входят. Цену указывают в «Рецептах».</p>
              )}
            </section>
          )}

          <p className="adm-muted">
            Заказ считается за тот день, когда его оформили (по времени Еревана). В суммах — товары со скидкой по промокоду, если
            она была, и доставка с фиксированной ценой; доставка, которую покупатель оплачивает отдельно, сюда не входит.
          </p>
        </>
      )}
    </>
  );
}

/**
 * The profit of the period: what the goods brought after promo discounts, minus what they cost to
 * make (each order keeps the cost it had when placed), plus the «Свой рецепт» requests that have a
 * price and a cost. Delivery is left out: it pays the courier.
 */
function ProfitCard({ stats }: { stats: OrderStats }) {
  const { goodsAmd, costAmd, profitAmd, uncostedQty } = stats.profit;
  const recipes = stats.recipes;
  const total = profitAmd + recipes.profitAmd;
  return (
    <section className="adm-card">
      <h2>Прибыль</h2>
      <table className="adm-table">
        <tbody>
          <tr>
            <td>Товары (со скидками, без доставки)</td>
            <td className="adm-num">{formatAmd(goodsAmd)}</td>
          </tr>
          <tr>
            <td>Себестоимость — ингредиенты по составу</td>
            <td className="adm-num">−{formatAmd(costAmd)}</td>
          </tr>
          {recipes.costedCount > 0 && (
            <tr>
              <td>
                Свой рецепт: {recipes.costedCount} {plural(recipes.costedCount, ['заявка', 'заявки', 'заявок'])} с ценой и
                себестоимостью
              </td>
              <td className="adm-num">{formatAmd(recipes.profitAmd)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className={`adm-total${total < 0 ? ' adm-minus' : ''}`}>
            <td>Прибыль</td>
            <td className="adm-num">{formatAmd(total)}</td>
          </tr>
        </tfoot>
      </table>
      {uncostedQty > 0 && (
        <p className="alert">
          {uncostedQty} {plural(uncostedQty, ['штука продана', 'штуки проданы', 'штук продано'])} без состава («—» в таблице «Что
          продано»): себестоимость не известна и не вычтена, поэтому настоящая прибыль меньше. Укажите состав в карточке товара —
          он будет учитываться в следующих заказах.
        </p>
      )}
      {stats.purchasesAmd > 0 && (
        <p className="adm-muted">
          Закупки на «<Link to="/admin/warehouse">Складе</Link>» за этот период: {formatAmd(stats.purchasesAmd)}. Это деньги, отданные за
          ингредиенты; в себестоимость заказов они входят по мере того, как ингредиенты уходят в товары.
        </p>
      )}
    </section>
  );
}
