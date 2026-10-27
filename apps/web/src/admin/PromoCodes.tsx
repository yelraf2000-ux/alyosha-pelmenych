import {
  categoryName,
  formatAmd,
  PROMO_CODE_MAX,
  promoLabel,
  shopToday,
  type AdminCategory,
  type AdminProduct,
  type AdminPromoCode,
  type PromoCodeInput,
  type PromoKind,
} from '@alyosha/shared';
import { useState, type FormEvent } from 'react';
import { plural } from '../lib/format';
import { adminApi } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';

const CODE_PATTERN = /^[\p{L}\p{N}_-]{3,30}$/u;

const longDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' });
/** «2026-12-31» → «31 декабря 2026 г.» */
const formatDay = (iso: string) => longDate.format(new Date(`${iso}T12:00:00`));

type Status = { label: string; tone: 'on' | 'off' };

/** Whether a buyer can use the code today, and if not, why. */
function statusOf(promo: AdminPromoCode): Status {
  if (!promo.isActive) return { label: 'Выключен', tone: 'off' };
  if (promo.validUntil && promo.validUntil < shopToday()) return { label: 'Срок истёк', tone: 'off' };
  if (promo.maxUses !== null && promo.uses >= promo.maxUses) return { label: 'Израсходован', tone: 'off' };
  return { label: 'Действует', tone: 'on' };
}

/** «на все товары», or the categories and products it is limited to. */
function scopeOf(promo: AdminPromoCode, categories: AdminCategory[], products: AdminProduct[]): string {
  if (promo.categories.length === 0 && promo.productIds.length === 0) return 'на все товары';
  const names = [
    ...promo.categories.map((slug) => categoryName(categories, slug)),
    ...promo.productIds.map((id) => products.find((product) => product.id === id)?.name ?? 'удалённый товар'),
  ];
  return `на: ${names.join(', ')}`;
}

function limitsOf(promo: AdminPromoCode): string {
  const parts = [
    promo.maxUses === null ? `использован ${promo.uses} ${plural(promo.uses, ['раз', 'раза', 'раз'])}` : `использован ${promo.uses} из ${promo.maxUses}`,
    promo.validUntil ? `до ${formatDay(promo.validUntil)} включительно` : 'бессрочный',
  ];
  return parts.join(' · ');
}

// ---------- The form ----------

interface FormState {
  code: string;
  kind: PromoKind;
  value: string;
  limited: boolean;
  categories: string[];
  productIds: number[];
  maxUses: string;
  validUntil: string;
  isActive: boolean;
}

const blank: FormState = {
  code: '',
  kind: 'percent',
  value: '',
  limited: false,
  categories: [],
  productIds: [],
  maxUses: '',
  validUntil: '',
  isActive: true,
};

function toForm(promo: AdminPromoCode): FormState {
  return {
    code: promo.code,
    kind: promo.kind,
    value: String(promo.value),
    limited: promo.categories.length > 0 || promo.productIds.length > 0,
    categories: promo.categories,
    productIds: promo.productIds,
    maxUses: promo.maxUses === null ? '' : String(promo.maxUses),
    validUntil: promo.validUntil ?? '',
    isActive: promo.isActive,
  };
}

/** What is wrong with the form, field by field; empty when it can be saved. */
function problemsOf(form: FormState): Partial<Record<'code' | 'value' | 'scope' | 'maxUses', string>> {
  const problems: Partial<Record<'code' | 'value' | 'scope' | 'maxUses', string>> = {};
  if (!CODE_PATTERN.test(form.code.trim())) {
    problems.code = `От 3 до ${PROMO_CODE_MAX} знаков: буквы, цифры, «-» и «_», без пробелов.`;
  }
  const value = Number(form.value);
  if (!Number.isInteger(value) || value < 1) problems.value = 'Укажите целое число больше нуля.';
  else if (form.kind === 'percent' && value > 100) problems.value = 'Процент — не больше 100.';
  if (form.limited && form.categories.length === 0 && form.productIds.length === 0) {
    problems.scope = 'Выберите хотя бы одну категорию или товар.';
  }
  if (form.maxUses.trim() && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) < 1)) {
    problems.maxUses = 'Целое число больше нуля, или оставьте пустым.';
  }
  return problems;
}

function toInput(form: FormState): PromoCodeInput {
  return {
    code: form.code.trim(),
    kind: form.kind,
    value: Number(form.value),
    categories: form.limited ? form.categories : [],
    productIds: form.limited ? form.productIds : [],
    maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
    validUntil: form.validUntil || null,
    isActive: form.isActive,
  };
}

function PromoForm({
  editing,
  categories,
  products,
  onSaved,
  onDeleted,
  onCancel,
}: {
  editing: AdminPromoCode | null;
  categories: AdminCategory[];
  products: AdminProduct[];
  onSaved: (promo: AdminPromoCode) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(editing ? toForm(editing) : blank);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = problemsOf(form);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(problems).length > 0 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const input = toInput(form);
      onSaved(editing ? await adminApi.updatePromoCode(editing.id, input) : await adminApi.createPromoCode(input));
    } catch (reason) {
      setFailure(errorText(reason));
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const question =
      editing.uses > 0
        ? `Удалить промокод ${editing.code}? Заказы, оформленные с ним, останутся как были, со своей скидкой.`
        : `Удалить промокод ${editing.code}?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setFailure(null);
    try {
      await adminApi.deletePromoCode(editing.id);
      onDeleted();
    } catch (reason) {
      setFailure(errorText(reason));
      setBusy(false);
    }
  }

  const error = (key: keyof typeof problems) =>
    showErrors && problems[key] ? (
      <p className="field__error" role="alert">
        {problems[key]}
      </p>
    ) : null;

  return (
    <form className="adm-card adm-form adm-promo-form" onSubmit={submit} noValidate>
      <h2>{editing ? `Промокод ${editing.code}` : 'Новый промокод'}</h2>

      <div className="field">
        <label className="field__label" htmlFor="promo-code">
          Код <span aria-hidden="true">*</span>
        </label>
        <input
          id="promo-code"
          className="field__input adm-promo-form__code"
          value={form.code}
          maxLength={PROMO_CODE_MAX}
          placeholder="Например: PELMENI20"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => set('code', event.target.value.toUpperCase().replace(/\s/g, ''))}
        />
        <p className="field__hint">Покупатель вводит его при оформлении заказа. Большие и маленькие буквы не различаются.</p>
        {error('code')}
      </div>

      <fieldset className="adm-promo-form__group">
        <legend className="field__label">Скидка *</legend>
        <div className="adm-promo-form__value">
          <input
            className="field__input"
            inputMode="numeric"
            value={form.value}
            aria-label={form.kind === 'percent' ? 'Скидка в процентах' : 'Скидка в драмах'}
            onChange={(event) => set('value', event.target.value.replace(/[^\d]/g, ''))}
          />
          <div className="chips" role="radiogroup" aria-label="Чем считать скидку">
            {(
              [
                ['percent', '%'],
                ['amount', '֏'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                className={`chip${form.kind === kind ? ' chip--active' : ''}`}
                onClick={() => set('kind', kind)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="field__hint">
          {form.kind === 'percent'
            ? 'Процент от стоимости товаров, на которые действует код.'
            : 'Сумма, на которую уменьшится стоимость этих товаров (не больше их стоимости).'}{' '}
          Доставка не меняется.
        </p>
        {error('value')}
      </fieldset>

      <fieldset className="adm-promo-form__group">
        <legend className="field__label">На что действует</legend>
        <div className="chips" role="radiogroup" aria-label="На что действует">
          <button
            type="button"
            role="radio"
            aria-checked={!form.limited}
            className={`chip${!form.limited ? ' chip--active' : ''}`}
            onClick={() => set('limited', false)}
          >
            На все товары
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={form.limited}
            className={`chip${form.limited ? ' chip--active' : ''}`}
            onClick={() => set('limited', true)}
          >
            На выбранные
          </button>
        </div>

        {form.limited && (
          <div className="adm-promo-form__scope">
            <p className="adm-muted">Категории — код действует на все товары в них, и на те, что вы добавите позже:</p>
            <div className="chips" role="group" aria-label="Категории">
              {categories.map((category) => (
                <button
                  key={category.slug}
                  type="button"
                  aria-pressed={form.categories.includes(category.slug)}
                  className={`chip${form.categories.includes(category.slug) ? ' chip--active' : ''}`}
                  onClick={() => set('categories', toggle(form.categories, category.slug))}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <p className="adm-muted">Или отдельные товары:</p>
            <div className="chips" role="group" aria-label="Товары">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  aria-pressed={form.productIds.includes(product.id)}
                  className={`chip${form.productIds.includes(product.id) ? ' chip--active' : ''}`}
                  onClick={() => set('productIds', toggle(form.productIds, product.id))}
                >
                  {product.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error('scope')}
      </fieldset>

      <div className="adm-form__pair">
        <div className="field">
          <label className="field__label" htmlFor="promo-uses">
            Сколько раз можно использовать
          </label>
          <input
            id="promo-uses"
            className="field__input"
            inputMode="numeric"
            value={form.maxUses}
            placeholder="Без ограничения"
            onChange={(event) => set('maxUses', event.target.value.replace(/[^\d]/g, ''))}
          />
          <p className="field__hint">Один заказ — одно использование. Отменённые заказы не считаются.</p>
          {error('maxUses')}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="promo-until">
            Действует до
          </label>
          <input
            id="promo-until"
            className="field__input"
            type="date"
            value={form.validUntil}
            onChange={(event) => set('validUntil', event.target.value)}
          />
          <p className="field__hint">Включительно. Пусто — бессрочно.</p>
        </div>
      </div>

      <label className="adm-check">
        <input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} />
        Промокод включён
      </label>

      {failure && (
        <p className="alert alert--error" role="alert">
          {failure}
        </p>
      )}

      <div className="adm-form__submit">
        <div className="adm-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
        {editing && (
          <button type="button" className="btn adm-danger" disabled={busy} onClick={remove}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- The page ----------

/** The owner's promo codes: make one, see how it is used, change or delete it. */
export function PromoCodesPage() {
  const promos = useLoad(() => adminApi.promoCodes(), [], { refreshOnFocus: true });
  const catalog = useLoad(() => Promise.all([adminApi.categories(), adminApi.products()]), []);
  const [editing, setEditing] = useState<AdminPromoCode | 'new' | null>(null);

  const [categories, products] = catalog.data ?? [[], []];
  const list = promos.data;

  return (
    <>
      <PageHead title="Промокоды">
        {editing === null && (
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            Новый промокод
          </button>
        )}
      </PageHead>
      <p className="adm-muted">
        Покупатель вводит промокод при оформлении заказа и сразу видит скидку. Скидка — только на товары, доставка не
        меняется. В каждом заказе и в сообщении в Telegram видно, с каким промокодом он оформлен.
      </p>

      {editing !== null && catalog.data && (
        <PromoForm
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing === 'new' ? null : editing}
          categories={categories}
          products={products}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            if (list) {
              promos.setData(list.some((item) => item.id === saved.id) ? list.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...list]);
            }
            setEditing(null);
          }}
          onDeleted={() => {
            if (list && editing !== 'new') promos.setData(list.filter((item) => item.id !== editing.id));
            setEditing(null);
          }}
        />
      )}
      {editing !== null && !catalog.data && <LoadState error={catalog.error} onRetry={catalog.reload} />}

      {!list ? (
        <LoadState error={promos.error} onRetry={promos.reload} />
      ) : list.length === 0 ? (
        editing === null && <p className="adm-muted">Промокодов пока нет.</p>
      ) : (
        <ul className="adm-list">
          {list.map((promo) => {
            const status = statusOf(promo);
            return (
              <li key={promo.id}>
                <button
                  type="button"
                  className={`adm-row adm-promo${editing !== null && editing !== 'new' && editing.id === promo.id ? ' adm-promo--editing' : ''}`}
                  onClick={() => {
                    setEditing(promo);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <span className="adm-row__main">
                    <strong className="adm-promo__code">{promo.code}</strong>
                    <span className={`adm-status adm-promo__status--${status.tone}`}>{status.label}</span>
                  </span>
                  <span className="adm-row__sub">
                    {scopeOf(promo, categories, products)} · {limitsOf(promo)}
                  </span>
                  <span className="adm-row__side">
                    <strong>{promoLabel(promo, formatAmd)}</strong>
                    {promo.discountGivenAmd > 0 && <span className="adm-muted">скидок на {formatAmd(promo.discountGivenAmd)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
