import type { AdminCategory } from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { plural } from '../lib/format';
import { adminApi } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';

const NAME_MAX = 40;

function CategoryRow({
  category,
  onSaved,
  onDeleted,
  onError,
}: {
  category: AdminCategory;
  onSaved: (category: AdminCategory) => void;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(category.name), [category.name]);

  const changed = name.trim() !== category.name && name.trim() !== '';

  async function run(work: () => Promise<void>) {
    setBusy(true);
    onError(null);
    try {
      await work();
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="adm-category">
      <form
        className="adm-category__name"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !busy) void run(async () => onSaved(await adminApi.renameCategory(category.slug, name.trim())));
        }}
      >
        <input
          className="field__input"
          value={name}
          maxLength={NAME_MAX}
          aria-label={`Название категории «${category.name}»`}
          onChange={(event) => setName(event.target.value)}
        />
        {changed && (
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Сохранить
          </button>
        )}
      </form>
      <span className="adm-muted">
        {category.productCount === 0
          ? 'нет товаров'
          : `${category.productCount} ${plural(category.productCount, ['товар', 'товара', 'товаров'])}`}
      </span>
      {/* Only an empty category can go: its products would be left without a place in the catalog. */}
      <button
        type="button"
        className="btn adm-danger"
        disabled={busy || category.productCount > 0}
        title={category.productCount > 0 ? 'Сначала перенесите товары в другую категорию' : undefined}
        onClick={() =>
          run(async () => {
            await adminApi.deleteCategory(category.slug);
            onDeleted();
          })
        }
      >
        Удалить
      </button>
    </li>
  );
}

/** The owner's own groups of the catalog: add one, rename it, delete an empty one. */
export function CategoriesPage() {
  const { data: categories, setData, error, reload } = useLoad(() => adminApi.categories(), [], { refreshOnFocus: true });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy || !categories) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await adminApi.createCategory(name.trim());
      setData([...categories, created]);
      setName('');
    } catch (reason) {
      setActionError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/admin/products" className="adm-back">
        ← Все товары
      </Link>
      <PageHead title="Категории" />

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      {!categories ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <>
          <ul className="adm-list">
            {categories.map((category) => (
              <CategoryRow
                key={category.slug}
                category={category}
                onError={setActionError}
                onSaved={(saved) => setData(categories.map((item) => (item.slug === saved.slug ? saved : item)))}
                onDeleted={() => setData(categories.filter((item) => item.slug !== category.slug))}
              />
            ))}
          </ul>

          <form className="adm-card adm-category-add" onSubmit={add}>
            <label className="field__label" htmlFor="new-category">
              Новая категория
            </label>
            <div className="adm-category__name">
              <input
                id="new-category"
                className="field__input"
                value={name}
                maxLength={NAME_MAX}
                placeholder="Например: Чебуреки"
                onChange={(event) => setName(event.target.value)}
              />
              <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
                Добавить
              </button>
            </div>
            <p className="adm-muted">
              На сайте категория появляется в фильтре каталога, как только в ней есть хотя бы один товар. Удалить можно только пустую
              категорию.
            </p>
          </form>
        </>
      )}
    </>
  );
}
