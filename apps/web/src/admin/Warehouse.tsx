import {
  EXPENSE_UNIT_LABELS,
  EXPENSE_UNITS,
  formatAmd,
  shopToday,
  type Expense,
  type ExpenseInput,
  type ExpenseUnit,
} from '@alyosha/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../components/Field';
import { adminApi } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';

const quantity = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const formatDay = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`));
/** "2026-11" → «Ноябрь 2026». */
function formatMonth(month: string): string {
  const text = monthLabel.format(new Date(`${month}-01T00:00:00Z`)).replace(/\s*г\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «10 кг». */
export function formatQty(expense: Pick<Expense, 'qty' | 'unit'>): string {
  return `${quantity.format(expense.qty)} ${EXPENSE_UNIT_LABELS[expense.unit]}`;
}

/** «4,5» or «4.5» → 4.5; null for anything that is not a positive number. */
function parseQty(value: string): number | null {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) return null;
  return Number(text);
}

/** The first and the last day of the month a date is in: for the link to the statistics. */
function monthPeriod(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const last = end.toISOString().slice(0, 10);
  const today = shopToday();
  return { from, to: last > today ? today : last };
}

/**
 * «Склад»: what the owner spent money on — meat, flour, bags. Each expense is a name, how much of
 * it and what was paid. The order statistics take them away from the revenue, so he sees profit.
 */
export function WarehousePage() {
  const { data: expenses, setData, error, reload } = useLoad(() => adminApi.expenses(), [], { refreshOnFocus: true });
  const [editing, setEditing] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Names used before, for the name field to offer them.
  const names = [...new Set((expenses ?? []).map((expense) => expense.name))];
  const months = groupByMonth(expenses ?? []);
  const thisMonth = monthPeriod(shopToday());

  async function remove(expense: Expense) {
    if (!window.confirm(`Удалить расход «${expense.name}, ${formatQty(expense)}, ${formatAmd(expense.amountAmd)}»?`)) return;
    setActionError(null);
    try {
      await adminApi.deleteExpense(expense.id);
      setData((expenses ?? []).filter((item) => item.id !== expense.id));
      setEditing(null);
    } catch (reason) {
      setActionError(errorText(reason));
    }
  }

  return (
    <>
      <PageHead title="Склад" />
      <p className="adm-muted">
        Записывайте, на что потратили деньги: мясо, муку, пакеты. В «
        <Link to={`/admin/orders/stats?from=${thisMonth.from}&to=${thisMonth.to}`}>Статистике</Link>» заказов эти расходы
        вычитаются из выручки — так видна прибыль.
      </p>

      <ExpenseForm
        names={names}
        onSaved={(created) => setData(sortExpenses([created, ...(expenses ?? [])]))}
      />

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!expenses ? (
        <LoadState error={error} onRetry={reload} />
      ) : expenses.length === 0 ? (
        <p className="adm-muted">Расходов пока нет.</p>
      ) : (
        months.map(({ month, items, totalAmd }) => {
          const period = monthPeriod(`${month}-01`);
          return (
            <section key={month} className="adm-card">
              <div className="adm-expenses__head">
                <h2>{formatMonth(month)}</h2>
                <strong>{formatAmd(totalAmd)}</strong>
              </div>
              <ul className="adm-expenses">
                {items.map((expense) =>
                  editing === expense.id ? (
                    <li key={expense.id}>
                      <ExpenseForm
                        expense={expense}
                        names={names}
                        onSaved={(saved) => {
                          setData(sortExpenses((expenses ?? []).map((item) => (item.id === saved.id ? saved : item))));
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        onDelete={() => remove(expense)}
                      />
                    </li>
                  ) : (
                    <li key={expense.id}>
                      <button type="button" className="adm-expense" onClick={() => setEditing(expense.id)}>
                        <span className="adm-expense__name">{expense.name}</span>
                        <span className="adm-expense__amount">{formatAmd(expense.amountAmd)}</span>
                        <span className="adm-muted">
                          {formatDay(expense.spentOn)} · {formatQty(expense)}
                          {perUnit(expense) && ` · ${perUnit(expense)}`}
                        </span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
              <Link className="adm-muted" to={`/admin/orders/stats?from=${period.from}&to=${period.to}`}>
                Прибыль за этот месяц →
              </Link>
            </section>
          );
        })
      )}
    </>
  );
}

/** «1 000 ֏ за кг», when there is more than one of the thing. */
function perUnit(expense: Expense): string | null {
  if (expense.qty === 1) return null;
  return `${formatAmd(Math.round(expense.amountAmd / expense.qty))} за ${EXPENSE_UNIT_LABELS[expense.unit]}`;
}

function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => (a.spentOn === b.spentOn ? b.id - a.id : a.spentOn < b.spentOn ? 1 : -1));
}

function groupByMonth(expenses: Expense[]) {
  const months: { month: string; items: Expense[]; totalAmd: number }[] = [];
  for (const expense of expenses) {
    const month = expense.spentOn.slice(0, 7);
    let group = months.find((item) => item.month === month);
    if (!group) {
      group = { month, items: [], totalAmd: 0 };
      months.push(group);
    }
    group.items.push(expense);
    group.totalAmd += expense.amountAmd;
  }
  return months;
}

/** A new expense, or an existing one opened for changing (then with «Отмена» and «Удалить»). */
function ExpenseForm({
  expense,
  names,
  onSaved,
  onCancel,
  onDelete,
}: {
  expense?: Expense;
  names: string[];
  onSaved: (expense: Expense) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(expense?.name ?? '');
  const [qty, setQty] = useState(expense ? String(expense.qty).replace('.', ',') : '');
  const [unit, setUnit] = useState<ExpenseUnit>(expense?.unit ?? 'kg');
  const [amount, setAmount] = useState(expense ? String(expense.amountAmd) : '');
  const [date, setDate] = useState(expense?.spentOn ?? shopToday());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const qtyValue = parseQty(qty);
  const amountValue = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const errors = {
    name: name.trim() ? null : 'Что купили',
    qty: qtyValue !== null ? null : 'Число больше нуля',
    amount: amountValue !== null ? null : 'Целое число в драмах',
  };
  const valid = !errors.name && !errors.qty && !errors.amount;
  const listId = `expense-names-${expense?.id ?? 'new'}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (!valid || busy) return;
    const input: ExpenseInput = { name: name.trim(), qty: qtyValue!, unit, amountAmd: amountValue!, spentOn: date };
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = expense ? await adminApi.updateExpense(expense.id, input) : await adminApi.createExpense(input);
      onSaved(result);
      if (!expense) {
        setSaved(`Записано: ${result.name}, ${formatQty(result)}, ${formatAmd(result.amountAmd)}.`);
        setName('');
        setQty('');
        setAmount('');
        setShowErrors(false);
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={expense ? 'adm-expense-form adm-expense-form--edit' : 'adm-card adm-expense-form'} onSubmit={submit} noValidate>
      {!expense && <h2>Добавить расход</h2>}
      <Field
        label="Что купили"
        value={name}
        onChange={setName}
        maxLength={80}
        placeholder="Говядина"
        list={listId}
        error={showErrors ? errors.name : null}
      />
      <datalist id={listId}>
        {names.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <div className="adm-expense-form__row">
        <Field
          label="Сколько"
          value={qty}
          onChange={setQty}
          inputMode="decimal"
          placeholder="10"
          error={showErrors ? errors.qty : null}
        />
        <div className="field">
          <label className="field__label" htmlFor={`${listId}-unit`}>
            Единица
          </label>
          <select
            id={`${listId}-unit`}
            className="field__input"
            value={unit}
            onChange={(event) => setUnit(event.target.value as ExpenseUnit)}
          >
            {EXPENSE_UNITS.map((value) => (
              <option key={value} value={value}>
                {EXPENSE_UNIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Заплатили, ֏"
          value={amount}
          onChange={(value) => setAmount(value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder="10000"
          error={showErrors ? errors.amount : null}
        />
      </div>
      <label className="adm-expense-form__date">
        <span>Дата</span>
        <input type="date" value={date} max={shopToday()} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>
      {valid && qtyValue !== 1 && (
        <p className="adm-muted">
          Это {formatAmd(Math.round(amountValue! / qtyValue!))} за {EXPENSE_UNIT_LABELS[unit]}.
        </p>
      )}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="alert" role="status">
          {saved}
        </p>
      )}
      <div className="adm-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Сохраняем…' : expense ? 'Сохранить' : 'Добавить'}
        </button>
        {onCancel && (
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn adm-danger adm-actions__last" disabled={busy} onClick={onDelete}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
