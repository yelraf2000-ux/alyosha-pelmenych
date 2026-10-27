import { formatAmd, type AdminOrder, type DeliveryMethod, type StockShortage } from '@alyosha/shared';
import { useState, type FormEvent } from 'react';
import { Field } from '../components/Field';
import { QtyStepper } from '../components/QtyStepper';
import { normalizePhone, normalizeTelegram, validateName, validatePhone, validateTelegram } from '../lib/validation';
import { adminApi, ApiError } from './api';
import { errorText, useLoad } from './shared';

interface Line {
  productId: number;
  name: string;
  /** The price it was bought at; a product added now shows today's. */
  priceAmd: number;
  qty: number;
}

/**
 * The owner rewrites an order: the buyer's details, the delivery and the goods. The server moves
 * the stock by the difference and works the discount and delivery out again; the goods of a
 * completed or cancelled order stay as they were.
 */
export function OrderEditor({
  order,
  onSaved,
  onCancel,
}: {
  order: AdminOrder;
  onSaved: (order: AdminOrder) => void;
  onCancel: () => void;
}) {
  const products = useLoad(() => adminApi.products(), []);
  const [name, setName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.customerPhone);
  const [telegram, setTelegram] = useState(order.customerTelegram ? `@${order.customerTelegram}` : '');
  const [comment, setComment] = useState(order.comment ?? '');
  const [method, setMethod] = useState<DeliveryMethod>(order.deliveryMethod);
  const [address, setAddress] = useState(order.deliveryAddress ?? '');
  const [lines, setLines] = useState<Line[]>(order.items.map(({ productId, name, priceAmd, qty }) => ({ productId, name, priceAmd, qty })));
  const [adding, setAdding] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [shortages, setShortages] = useState<StockShortage[]>([]);

  const goodsLocked = order.status === 'done' || order.status === 'cancelled';
  const errors = {
    name: validateName(name),
    phone: validatePhone(phone),
    telegram: validateTelegram(telegram),
    address: method === 'courier' && !address.trim() ? 'Укажите адрес доставки' : null,
    lines: lines.length === 0 ? 'В заказе должен остаться хотя бы один товар' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  // Products that can be added: on sale and not in the order yet.
  const addable = (products.data ?? []).filter((product) => product.isActive && !lines.some((line) => line.productId === product.id));
  const itemsTotal = lines.reduce((sum, line) => sum + line.priceAmd * line.qty, 0);

  function setQty(productId: number, qty: number) {
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, qty } : line)));
  }

  function add() {
    const product = addable.find((item) => String(item.id) === adding);
    if (!product) return;
    setLines((current) => [...current, { productId: product.id, name: product.name, priceAmd: product.priceAmd, qty: 1 }]);
    setAdding('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (hasErrors || busy) return;
    setBusy(true);
    setFailure(null);
    setShortages([]);
    try {
      const result = await adminApi.editOrder(order.id, {
        customerName: name.trim(),
        customerPhone: normalizePhone(phone) ?? phone,
        customerTelegram: telegram.trim() ? normalizeTelegram(telegram) : null,
        comment: comment.trim() || null,
        deliveryMethod: method,
        deliveryAddress: method === 'courier' ? address.trim() : null,
        items: lines.map(({ productId, qty }) => ({ productId, qty })),
      });
      onSaved(result.order);
    } catch (reason) {
      setFailure(
        reason instanceof ApiError && reason.code === 'items_locked'
          ? 'Состав выполненного или отменённого заказа менять нельзя: верните прежние товары или отмените изменения.'
          : errorText(reason),
      );
      if (reason instanceof ApiError && reason.body?.shortages) setShortages(reason.body.shortages);
      setBusy(false);
    }
  }

  return (
    <form className="adm-form adm-order-edit" onSubmit={submit} noValidate>
      <section className="adm-card">
        <h2>Покупатель</h2>
        <Field label="Имя" value={name} onChange={setName} required error={showErrors ? errors.name : null} />
        <Field label="Телефон" value={phone} onChange={setPhone} type="tel" required error={showErrors ? errors.phone : null} />
        <Field label="Telegram" value={telegram} onChange={setTelegram} placeholder="@username" error={showErrors ? errors.telegram : null} />
        <Field label="Комментарий" value={comment} onChange={setComment} multiline />
      </section>

      <section className="adm-card">
        <h2>Получение</h2>
        <div className="chips" role="radiogroup" aria-label="Способ получения">
          {(
            [
              ['pickup', 'Самовывоз'],
              ['courier', 'Курьер'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              className={`chip${method === value ? ' chip--active' : ''}`}
              onClick={() => setMethod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {method === 'courier' && (
          <Field label="Адрес доставки" value={address} onChange={setAddress} required error={showErrors ? errors.address : null} />
        )}
      </section>

      <section className="adm-card">
        <h2>Состав</h2>
        {goodsLocked && (
          <p className="adm-muted">Заказ {order.status === 'done' ? 'выполнен' : 'отменён'}: товары в нём уже не меняются.</p>
        )}
        <ul className="adm-order-edit__lines">
          {lines.map((line) => (
            <li key={line.productId}>
              <span>
                {line.name}
                <span className="adm-muted"> по {formatAmd(line.priceAmd)}</span>
              </span>
              <span className="adm-order-edit__qty">
                <QtyStepper value={line.qty} max={999} disabled={goodsLocked} onChange={(qty) => setQty(line.productId, qty)} />
                <button
                  type="button"
                  className="link-btn"
                  disabled={goodsLocked}
                  onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}
                >
                  Убрать
                </button>
              </span>
            </li>
          ))}
        </ul>
        {!goodsLocked && addable.length > 0 && (
          <div className="adm-order-edit__add">
            <select className="field__input" value={adding} aria-label="Добавить товар" onChange={(event) => setAdding(event.target.value)}>
              <option value="">Добавить товар…</option>
              {addable.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — {formatAmd(product.priceAmd)}
                </option>
              ))}
            </select>
            <button type="button" className="btn" disabled={!adding} onClick={add}>
              Добавить
            </button>
          </div>
        )}
        {showErrors && errors.lines && <p className="field__error">{errors.lines}</p>}
        <p className="adm-muted">
          Товары: {formatAmd(itemsTotal)}. Скидку по промокоду, доставку и итог сайт пересчитает при сохранении; склад изменится на
          разницу.
        </p>
      </section>

      {failure && (
        <div className="alert alert--error" role="alert">
          <p>{failure}</p>
          {shortages.length > 0 && (
            <ul>
              {shortages.map((shortage) => (
                <li key={shortage.productId}>
                  {shortage.name}: можно не больше {shortage.available} шт.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="adm-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
