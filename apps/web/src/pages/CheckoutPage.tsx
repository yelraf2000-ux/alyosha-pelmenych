import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitOrder } from '../api';
import { Field } from '../components/Field';
import { t } from '../i18n';
import { calcDeliveryFee, isDeliveryExtra } from '../lib/delivery';
import { formatAmd } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { normalizePhone, normalizeTelegram, validateName, validatePhone, validateTelegram } from '../lib/validation';
import { useCart } from '../state/CartContext';
import { useShop } from '../state/ShopContext';
import type { DeliveryMethod, StockShortage } from '../types';
import { saveLastOrder } from './OrderSuccessPage';

export default function CheckoutPage() {
  useTitle(t.checkout.title);
  const { settings, refresh } = useShop();
  const cart = useCart();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<DeliveryMethod>('pickup');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!settings) return null;

  if (cart.lines.length === 0) {
    return (
      <div className="section container narrow state">
        <h1>{t.cart.emptyTitle}</h1>
        {shortages.length > 0 && <ShortageAlert shortages={shortages} />}
        <p>{t.cart.emptyText}</p>
        <Link to="/catalog" className="btn btn--primary">
          {t.product.toCatalog}
        </Link>
      </div>
    );
  }

  const errors = {
    name: validateName(name),
    phone: validatePhone(phone),
    telegram: validateTelegram(telegram),
    address: method === 'courier' && !address.trim() ? t.form.errors.address : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const deliveryFee = calcDeliveryFee(method, cart.subtotal, settings);
  // No fixed courier price: delivery is paid separately and is not part of the total.
  const deliveryExtra = isDeliveryExtra(method, cart.subtotal, settings);
  const courierExtra = isDeliveryExtra('courier', cart.subtotal, settings);
  const total = cart.subtotal + deliveryFee;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setFailure(null);
    if (hasErrors) {
      // On a phone the submit button is far below the fields: bring the first problem into view.
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setShortages([]);
    try {
      const result = await submitOrder({
        customerName: name.trim(),
        customerPhone: normalizePhone(phone) ?? phone,
        customerTelegram: telegram.trim() ? normalizeTelegram(telegram) : null,
        comment: comment.trim() || null,
        deliveryMethod: method,
        deliveryAddress: method === 'courier' ? address.trim() : null,
        website,
        items: cart.lines.map((line) => ({ productId: line.product.id, qty: line.qty })),
      });

      if (result.ok) {
        saveLastOrder(result.order);
        cart.clear();
        void refresh();
        navigate('/order/thanks', { replace: true, state: { order: result.order } });
        return;
      }

      if (result.error === 'insufficient_stock') {
        setShortages(result.shortages);
        // Fresh stock makes the cart correct itself; the box above the form explains what changed.
        await refresh();
        cart.dismissNotice();
        window.scrollTo({ top: 0 });
      } else {
        setFailure(result.error === 'rate_limited' ? t.checkout.rateLimited : t.checkout.failed);
      }
    } catch {
      setFailure(t.checkout.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="section container">
      <h1>{t.checkout.title}</h1>

      {shortages.length > 0 && <ShortageAlert shortages={shortages} />}

      <form className="split" ref={formRef} onSubmit={handleSubmit} noValidate>
        <div className="checkout">
          <fieldset className="panel">
            <legend>{t.checkout.methodTitle}</legend>
            <div className="options">
              <label className={`option${method === 'pickup' ? ' option--active' : ''}`}>
                <input
                  type="radio"
                  name="delivery"
                  checked={method === 'pickup'}
                  onChange={() => setMethod('pickup')}
                />
                <span className="option__title">{t.checkout.pickup}</span>
                <span className="option__note">{t.cart.free}</span>
              </label>
              <label className={`option${method === 'courier' ? ' option--active' : ''}`}>
                <input
                  type="radio"
                  name="delivery"
                  checked={method === 'courier'}
                  onChange={() => setMethod('courier')}
                />
                <span className="option__title">{t.checkout.courier}</span>
                <span className="option__note">
                  {courierExtra
                    ? t.cart.deliveryExtra
                    : calcDeliveryFee('courier', cart.subtotal, settings) === 0
                      ? t.cart.free
                      : formatAmd(settings.courierFeeAmd)}
                </span>
              </label>
            </div>

            {method === 'pickup' ? (
              <p className="method-note">
                <strong>{t.checkout.pickupAddress}:</strong> {settings.pickupAddress}
              </p>
            ) : (
              <>
                <Field
                  label={t.checkout.address}
                  value={address}
                  onChange={setAddress}
                  required
                  autoComplete="street-address"
                  hint={t.checkout.addressHint}
                  error={showErrors ? errors.address : null}
                />
                <p className="method-note">
                  {deliveryExtra
                    ? `${t.checkout.courierExtra}. ${t.cart.freeFrom(formatAmd(settings.freeDeliveryFromAmd))}`
                    : deliveryFee === 0
                      ? t.checkout.courierFree
                      : `${t.checkout.courierFee(formatAmd(deliveryFee))}. ${t.cart.freeFrom(formatAmd(settings.freeDeliveryFromAmd))}`}
                  .
                </p>
              </>
            )}
            {settings.deliveryNote && <p className="muted small">{settings.deliveryNote}</p>}
          </fieldset>

          <fieldset className="panel">
            <legend>{t.checkout.contactsTitle}</legend>
            <Field
              label={t.form.name}
              value={name}
              onChange={setName}
              required
              autoComplete="name"
              error={showErrors ? errors.name : null}
            />
            <Field
              label={t.form.phone}
              value={phone}
              onChange={setPhone}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+374"
              hint={t.form.phoneHint}
              error={showErrors ? errors.phone : null}
            />
            <Field
              label={t.form.telegram}
              value={telegram}
              onChange={setTelegram}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="@username"
              error={showErrors ? errors.telegram : null}
            />
            <Field label={t.form.comment} value={comment} onChange={setComment} multiline />

            {/* Honeypot: hidden from people, tempting for bots. */}
            <div className="hp" aria-hidden="true">
              <label>
                {t.checkout.hp}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>
          </fieldset>
        </div>

        <aside className="summary">
          <h2>{t.checkout.summaryTitle}</h2>
          <ul className="summary__items">
            {cart.lines.map(({ product, qty, lineTotal }) => (
              <li key={product.id}>
                <span>
                  {product.name} × {qty}
                </span>
                <span>{formatAmd(lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div>
              <dt>{t.cart.subtotal}</dt>
              <dd>{formatAmd(cart.subtotal)}</dd>
            </div>
            <div>
              <dt>{method === 'pickup' ? t.cart.pickup : t.cart.delivery}</dt>
              <dd>{deliveryExtra ? t.cart.deliveryExtra : deliveryFee === 0 ? t.cart.free : formatAmd(deliveryFee)}</dd>
            </div>
            <div className="totals__total">
              <dt>{t.cart.total}</dt>
              <dd>{deliveryExtra ? t.cart.plusDelivery(formatAmd(total)) : formatAmd(total)}</dd>
            </div>
          </dl>

          {showErrors && hasErrors && (
            <p className="alert alert--error" role="alert">
              {t.checkout.fixErrors}
            </p>
          )}
          {failure && (
            <p className="alert alert--error" role="alert">
              {failure}
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
            {submitting ? t.checkout.submitting : t.checkout.submit}
          </button>
          <p className="muted small">{t.checkout.noPayment}</p>
          <Link to="/cart" className="more-link summary__back">
            {t.checkout.backToCart}
          </Link>
        </aside>
      </form>
    </div>
  );
}

function ShortageAlert({ shortages }: { shortages: StockShortage[] }) {
  return (
    <div className="alert alert--error" role="alert">
      <strong>{t.checkout.shortageTitle}</strong>
      <ul>
        {shortages.map((s) => (
          <li key={s.productId}>
            {s.available > 0 ? t.checkout.shortageLeft(s.name, s.available) : t.checkout.shortageNone(s.name)}
          </li>
        ))}
      </ul>
      <p>{t.checkout.shortageHint}</p>
    </div>
  );
}
