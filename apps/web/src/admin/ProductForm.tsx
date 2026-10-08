import { CATEGORIES, type AdminProduct, type Category } from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { t } from '../i18n';
import { adminApi, type ProductInput } from './api';
import type { ProductsLocationState } from './Products';
import { errorText, LoadState, PageHead, useLoad } from './shared';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface FormState {
  name: string;
  category: Category;
  priceAmd: string;
  weightLabel: string;
  description: string;
  stockQty: string;
  isNew: boolean;
  isActive: boolean;
  slug: string;
}

const EMPTY: FormState = {
  name: '',
  category: 'pelmeni',
  priceAmd: '',
  weightLabel: '',
  description: '',
  stockQty: '0',
  isNew: false,
  isActive: true,
  slug: '',
};

function fromProduct(product: AdminProduct): FormState {
  return {
    name: product.name,
    category: product.category,
    priceAmd: String(product.priceAmd),
    weightLabel: product.weightLabel,
    description: product.description,
    stockQty: String(product.stockQty),
    isNew: product.isNew,
    isActive: product.isActive,
    slug: product.slug,
  };
}

const wholeNumber = (value: string) => /^\d+$/.test(value.trim());

/** Create and edit form: every product field plus the photo (SPEC §7). */
export function ProductFormPage() {
  const params = useParams();
  const id = params.id === undefined ? null : Number(params.id);
  const navigate = useNavigate();

  const loaded = useLoad(() => (id === null ? Promise.resolve(null) : adminApi.product(id)), [id]);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once, when the product arrives; later reloads must not overwrite what is being typed.
  useEffect(() => {
    if (loaded.data && loaded.data.id !== product?.id) {
      setProduct(loaded.data);
      setForm(fromProduct(loaded.data));
    }
  }, [loaded.data, product?.id]);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (id !== null && !product) {
    return (
      <>
        <Link to=".." relative="path" className="adm-back">
          ← Все товары
        </Link>
        <LoadState error={loaded.error} onRetry={loaded.reload} />
      </>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const errors = {
    name: form.name.trim() ? null : 'Напишите название',
    priceAmd: wholeNumber(form.priceAmd) ? null : 'Цена — целое число в драмах',
    stockQty: wholeNumber(form.stockQty) ? null : 'Количество — целое число',
    slug: !form.slug.trim() || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug.trim()) ? null : 'Только латинские буквы, цифры и дефис',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function choosePhoto(file: File | undefined) {
    setError(null);
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type)) return setError('Подойдут фото в формате JPG, PNG или WebP.');
    if (file.size > MAX_PHOTO_BYTES) return setError('Файл слишком большой. Максимум — 12 МБ.');
    setPhoto(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (hasErrors || busy) return;

    const input: ProductInput = {
      name: form.name.trim(),
      category: form.category,
      priceAmd: Number(form.priceAmd),
      weightLabel: form.weightLabel.trim(),
      description: form.description.trim(),
      stockQty: Number(form.stockQty),
      isNew: form.isNew,
      isActive: form.isActive,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };

    setBusy(true);
    setError(null);
    try {
      const saved = product ? await adminApi.updateProduct(product.id, input) : await adminApi.createProduct(input);
      // From here the product exists: a failed photo upload must not create it a second time.
      setProduct(saved.product);
      if (photo) {
        await adminApi.uploadImage(saved.product.id, photo);
        setPhoto(null);
      }
      const state: ProductsLocationState =
        saved.waiting.length > 0 ? { waiting: { productId: saved.product.id, requests: saved.waiting } } : {};
      navigate('/admin/products', { state });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!product || !window.confirm('Удалить фото товара?')) return;
    setBusy(true);
    setError(null);
    try {
      setProduct((await adminApi.deleteImage(product.id)).product);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product || !window.confirm(`Удалить «${product.name}» насовсем?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteProduct(product.id);
      navigate('/admin/products');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const shownPhoto = preview ?? product?.imagePath ?? null;

  return (
    <>
      <Link to=".." relative="path" className="adm-back">
        ← Все товары
      </Link>
      <PageHead title={product ? 'Изменить товар' : 'Новый товар'} />

      <form className="adm-form" onSubmit={submit} noValidate>
        <section className="adm-card">
          <Field label="Название" value={form.name} onChange={(v) => set('name', v)} required error={showErrors ? errors.name : null} />

          <div className="field">
            <label className="field__label" htmlFor="product-category">
              Категория <span aria-hidden="true">*</span>
            </label>
            <select
              id="product-category"
              className="field__input"
              value={form.category}
              onChange={(event) => set('category', event.target.value as Category)}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t.categories[category]}
                </option>
              ))}
            </select>
          </div>

          <div className="adm-form__pair">
            <Field
              label="Цена, ֏"
              value={form.priceAmd}
              onChange={(v) => set('priceAmd', v)}
              required
              inputMode="numeric"
              error={showErrors ? errors.priceAmd : null}
            />
            <Field
              label="Вес или упаковка"
              value={form.weightLabel}
              onChange={(v) => set('weightLabel', v)}
              placeholder="500 г"
            />
          </div>

          <Field
            label="Описание"
            value={form.description}
            onChange={(v) => set('description', v)}
            multiline
            hint="Состав, вкус, как готовить. Пустая строка начинает новый абзац."
          />
        </section>

        <section className="adm-card">
          <h2>Фото</h2>
          {shownPhoto ? (
            <img className="adm-photo" src={shownPhoto} alt="" />
          ) : (
            <p className="adm-muted">Фото пока нет. Лучше всего горизонтальное, 4:3.</p>
          )}
          <div className="adm-actions">
            <label className="btn">
              {shownPhoto ? 'Заменить фото' : 'Выбрать фото'}
              <input
                type="file"
                className="adm-file"
                accept={PHOTO_TYPES.join(',')}
                onChange={(event) => {
                  choosePhoto(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {photo && (
              <button type="button" className="btn" onClick={() => setPhoto(null)}>
                Отменить выбор
              </button>
            )}
            {!photo && product?.imagePath && (
              <button type="button" className="btn adm-danger" disabled={busy} onClick={removePhoto}>
                Удалить фото
              </button>
            )}
          </div>
          {photo && <p className="adm-muted">Новое фото сохранится вместе с товаром.</p>}
        </section>

        <section className="adm-card">
          <h2>Наличие и показ</h2>
          <Field
            label="На складе, шт."
            value={form.stockQty}
            onChange={(v) => set('stockQty', v)}
            required
            inputMode="numeric"
            hint="0 — на сайте будет «Ожидается поставка»."
            error={showErrors ? errors.stockQty : null}
          />
          <label className="adm-check">
            <input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} />
            Показывать на сайте
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={form.isNew} onChange={(event) => set('isNew', event.target.checked)} />
            Новинка
          </label>
        </section>

        <details className="adm-card">
          <summary>Адрес страницы товара</summary>
          <Field
            label="Адрес (латиницей)"
            value={form.slug}
            onChange={(v) => set('slug', v.toLowerCase())}
            autoCapitalize="none"
            placeholder="pelmeni-domashnie"
            hint={
              product
                ? 'Если поменять, старые ссылки на товар перестанут открываться.'
                : 'Можно не заполнять: адрес получится из названия.'
            }
            error={showErrors ? errors.slug : null}
          />
        </details>

        {showErrors && hasErrors && (
          <p className="alert alert--error" role="alert">
            Проверьте поля, отмеченные красным.
          </p>
        )}
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}

        <div className="adm-form__submit">
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {product && id !== null && (
            <button type="button" className="btn adm-danger" disabled={busy} onClick={remove}>
              Удалить товар
            </button>
          )}
        </div>
      </form>
    </>
  );
}
