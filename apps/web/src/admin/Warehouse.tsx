import {
  compositionCost,
  formatAmd,
  INGREDIENT_UNITS,
  shopToday,
  type AdminIngredient,
  type IngredientUnit,
  type WarehouseView,
} from '@alyosha/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../components/Field';
import { adminApi } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';
import {
  decimalInput,
  enoughFor,
  formatSmall,
  formatStock,
  formatUnitPrice,
  marginText,
  parseDecimal,
  UNITS,
} from './units';

const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const formatDate = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`));

/**
 * «Склад»: the ingredients with what is left and their average price, a form for a purchase, what
 * each product costs to make, and the latest purchases. Every change answers the whole warehouse.
 */
export function WarehousePage() {
  const { data, setData, error, reload } = useLoad(() => adminApi.warehouse(), [], { refreshOnFocus: true });
  const [actionError, setActionError] = useState<string | null>(null);

  /** Runs a change and shows the warehouse it answers; false when it failed. */
  async function change(run: () => Promise<WarehouseView>): Promise<boolean> {
    setActionError(null);
    try {
      setData(await run());
      return true;
    } catch (reason) {
      setActionError(errorText(reason));
      return false;
    }
  }

  return (
    <>
      <PageHead title="Склад" />
      <p className="adm-muted">
        Из чего вы делаете товары. Записывайте закупки — склад сам посчитает среднюю цену. Каждый заказ списывает ингредиенты по
        составу товара, а в «Статистике» заказов видна прибыль. Состав задаётся в карточке товара.
      </p>

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <>
          {data.ingredients.length > 0 && <PurchaseForm ingredients={data.ingredients} onSave={change} />}
          <Ingredients ingredients={data.ingredients} onChange={change} />
          <ProductCosts warehouse={data} />
          <Purchases warehouse={data} onChange={change} />
        </>
      )}
    </>
  );
}

type Change = (run: () => Promise<WarehouseView>) => Promise<boolean>;

function PurchaseForm({ ingredients, onSave }: { ingredients: AdminIngredient[]; onSave: Change }) {
  const [ingredientId, setIngredientId] = useState(String(ingredients[0]!.id));
  const [qty, setQty] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState(shopToday());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const ingredient = ingredients.find((item) => String(item.id) === ingredientId) ?? ingredients[0]!;
  const unit = UNITS[ingredient.unit];
  const amount = parseDecimal(qty);
  const paidAmd = /^\d+$/.test(paid.trim()) ? Number(paid.trim()) : null;
  const errors = {
    qty: amount !== null && amount > 0 ? null : `Сколько купили, в ${unit.big === 'шт.' ? 'штуках' : unit.big}`,
    paid: paidAmd !== null ? null : 'Сколько заплатили, целым числом в драмах',
  };
  const valid = !errors.qty && !errors.paid;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (!valid || busy) return;
    setBusy(true);
    setSaved(null);
    const ok = await onSave(() =>
      adminApi.addPurchase(ingredient.id, { qty: amount! * unit.factor, paidAmd: paidAmd!, purchasedOn: date }),
    );
    setBusy(false);
    if (ok) {
      setSaved(`Записано: ${ingredient.name}, ${formatStock(amount! * unit.factor, ingredient.unit)} за ${formatAmd(paidAmd!)}.`);
      setQty('');
      setPaid('');
      setShowErrors(false);
    }
  }

  return (
    <form className="adm-card adm-form adm-purchase" onSubmit={submit} noValidate>
      <h2>Записать закупку</h2>
      <div className="field">
        <label className="field__label" htmlFor="purchase-ingredient">
          Что купили
        </label>
        <select
          id="purchase-ingredient"
          className="field__input"
          value={ingredientId}
          onChange={(event) => setIngredientId(event.target.value)}
        >
          {ingredients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="adm-form__pair">
        <Field
          label={`Сколько, ${unit.big}`}
          value={qty}
          onChange={setQty}
          inputMode="decimal"
          placeholder={unit.factor > 1 ? '5' : '100'}
          error={showErrors ? errors.qty : null}
        />
        <Field
          label="Заплатили, ֏"
          value={paid}
          onChange={(value) => setPaid(value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder="25000"
          error={showErrors ? errors.paid : null}
        />
      </div>
      <label className="adm-purchase__date">
        <span>Дата</span>
        <input type="date" value={date} max={shopToday()} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>
      {valid && (
        <p className="adm-muted">
          Это {formatUnitPrice(paidAmd! / (amount! * unit.factor), ingredient.unit)}. Сейчас на складе {formatStock(ingredient.stockQty, ingredient.unit)}{' '}
          по {formatUnitPrice(ingredient.unitCostAmd, ingredient.unit)}.
        </p>
      )}
      {saved && (
        <p className="alert" role="status">
          {saved}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Записываем…' : 'Записать закупку'}
        </button>
      </div>
    </form>
  );
}

function Ingredients({ ingredients, onChange }: { ingredients: AdminIngredient[]; onChange: Change }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<IngredientUnit>('g');
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    if (await onChange(() => adminApi.createIngredient(name.trim(), unit))) setName('');
    setBusy(false);
  }

  return (
    <section className="adm-card">
      <h2>Ингредиенты</h2>
      {ingredients.length === 0 ? (
        <p className="adm-muted">
          Пока пусто. Добавьте то, из чего делаете товары: мясо, муку, лук, специи, пакеты. Потом записывайте закупки.
        </p>
      ) : (
        <ul className="adm-ingredients">
          {ingredients.map((ingredient) =>
            editing === ingredient.id ? (
              <IngredientEditor
                key={ingredient.id}
                ingredient={ingredient}
                onChange={onChange}
                onClose={() => setEditing(null)}
              />
            ) : (
              <li key={ingredient.id}>
                <button type="button" className="adm-ingredient" onClick={() => setEditing(ingredient.id)}>
                  <span className="adm-ingredient__name">{ingredient.name}</span>
                  <span className={`adm-ingredient__stock${ingredient.stockQty < 0 ? ' adm-ingredient__stock--minus' : ''}`}>
                    {formatStock(ingredient.stockQty, ingredient.unit)}
                  </span>
                  <span className="adm-ingredient__price adm-muted">
                    {ingredient.unitCostAmd > 0 ? formatUnitPrice(ingredient.unitCostAmd, ingredient.unit) : 'цена не известна'}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {ingredients.some((ingredient) => ingredient.stockQty < 0) && (
        <p className="adm-muted">
          Минус — по заказам ушло больше, чем записано закупок. Запишите закупку или поправьте остаток, нажав на строку.
        </p>
      )}

      <form className="adm-ingredient-add" onSubmit={add}>
        <input
          className="field__input"
          value={name}
          maxLength={60}
          placeholder="Новый ингредиент, например: Говядина"
          aria-label="Название нового ингредиента"
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className="field__input"
          value={unit}
          aria-label="В чём считать"
          onChange={(event) => setUnit(event.target.value as IngredientUnit)}
        >
          {INGREDIENT_UNITS.map((value) => (
            <option key={value} value={value}>
              {UNITS[value].label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={busy || !name.trim()}>
          Добавить
        </button>
      </form>
    </section>
  );
}

/** A row opened for correcting: the name, what a count of the shelf found, the price; or deleting. */
function IngredientEditor({
  ingredient,
  onChange,
  onClose,
}: {
  ingredient: AdminIngredient;
  onChange: Change;
  onClose: () => void;
}) {
  const unit = UNITS[ingredient.unit];
  const [name, setName] = useState(ingredient.name);
  const [stock, setStock] = useState(decimalInput(ingredient.stockQty / unit.factor));
  const [price, setPrice] = useState(String(Math.round(ingredient.unitCostAmd * unit.factor)));
  const [busy, setBusy] = useState(false);

  const stockValue = parseDecimal(stock);
  const priceValue = parseDecimal(price);
  const valid = Boolean(name.trim()) && stockValue !== null && priceValue !== null && priceValue >= 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onChange(() =>
      adminApi.updateIngredient(ingredient.id, {
        name: name.trim(),
        stockQty: stockValue! * unit.factor,
        unitCostAmd: priceValue! / unit.factor,
      }),
    );
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!window.confirm(`Удалить «${ingredient.name}» со склада вместе с его закупками?`)) return;
    setBusy(true);
    const ok = await onChange(() => adminApi.deleteIngredient(ingredient.id));
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <li>
      <form className="adm-ingredient-edit" onSubmit={save} noValidate>
        <Field label="Название" value={name} onChange={setName} maxLength={60} />
        <div className="adm-form__pair">
          <Field
            label={`Остаток, ${unit.big}`}
            value={stock}
            onChange={setStock}
            inputMode="decimal"
            hint="Если пересчитали, что есть на самом деле."
            error={stockValue === null ? 'Число' : null}
          />
          <Field
            label={`Цена за ${unit.big}, ֏`}
            value={price}
            onChange={setPrice}
            inputMode="decimal"
            hint="Средняя; закупки меняют её сами."
            error={priceValue === null || priceValue < 0 ? 'Число' : null}
          />
        </div>
        <div className="adm-actions">
          <button type="submit" className="btn btn--primary" disabled={busy || !valid}>
            Сохранить
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn adm-danger adm-actions__last" disabled={busy} onClick={remove}>
            Удалить
          </button>
        </div>
      </form>
    </li>
  );
}

/** What one of each product costs to make today, its profit, and how many the shelf has ingredients for. */
function ProductCosts({ warehouse }: { warehouse: WarehouseView }) {
  const stock = new Map(warehouse.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  return (
    <section className="adm-card">
      <h2>Себестоимость товаров</h2>
      {warehouse.products.length === 0 ? (
        <p className="adm-muted">
          Пока ни у одного товара нет состава. Откройте товар в «<Link to="/admin/products">Товарах</Link>» и заполните раздел
          «Себестоимость»: сколько каких ингредиентов уходит на одну штуку.
        </p>
      ) : (
        <ul className="adm-costs">
          {warehouse.products.map((product) => {
            const cost = compositionCost(product.composition, warehouse.ingredients);
            const profit = product.priceAmd - cost;
            const enough = enoughFor(product.composition, stock);
            return (
              <li key={product.id}>
                <Link to={`/admin/products/${product.id}`} className="adm-costs__name">
                  {product.name}
                </Link>
                <span className="adm-costs__numbers">
                  себестоимость {formatAmd(cost)} · цена {formatAmd(product.priceAmd)} ·{' '}
                  <strong className={profit < 0 ? 'adm-minus' : undefined}>
                    прибыль {formatAmd(profit)} ({marginText(profit, product.priceAmd)})
                  </strong>
                </span>
                <span className="adm-muted">
                  {enough.count > 0
                    ? `Ингредиентов хватит на ${enough.count} шт.`
                    : 'Ингредиентов не хватит ни на одну штуку'}
                  {enough.limitedBy && ` — меньше всего: ${enough.limitedBy}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Purchases({ warehouse, onChange }: { warehouse: WarehouseView; onChange: Change }) {
  const byId = new Map(warehouse.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  if (warehouse.purchases.length === 0) return null;

  async function remove(id: number, label: string) {
    if (!window.confirm(`Удалить закупку «${label}»? Остаток и средняя цена пересчитаются.`)) return;
    await onChange(() => adminApi.deletePurchase(id));
  }

  return (
    <section className="adm-card">
      <h2>Последние закупки</h2>
      <table className="adm-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Что</th>
            <th className="adm-num">Сколько</th>
            <th className="adm-num">Заплатили</th>
            <th aria-label="Удалить" />
          </tr>
        </thead>
        <tbody>
          {warehouse.purchases.map((purchase) => {
            const ingredient = byId.get(purchase.ingredientId);
            const qty = ingredient ? formatStock(purchase.qty, ingredient.unit) : formatSmall(purchase.qty, 'pcs');
            return (
              <tr key={purchase.id}>
                <td className="adm-nowrap">{formatDate(purchase.purchasedOn)}</td>
                <td>{ingredient?.name ?? '—'}</td>
                <td className="adm-num">{qty}</td>
                <td className="adm-num">{formatAmd(purchase.paidAmd)}</td>
                <td className="adm-num">
                  <button
                    type="button"
                    className="link-btn adm-purchase__remove"
                    aria-label={`Удалить закупку: ${ingredient?.name ?? ''}, ${qty}`}
                    onClick={() => remove(purchase.id, `${ingredient?.name ?? ''}, ${qty}`)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
