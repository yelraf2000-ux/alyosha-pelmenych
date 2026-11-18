import {
  compositionCost,
  formatAmd,
  PRODUCT_BADGE_MAX_LENGTH,
  PRODUCT_BADGES_MAX,
  type AdminCategory,
  type AdminIngredient,
  type AdminProduct,
  type CompositionLine,
} from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { adminApi, type ProductInput } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';
import { decimalInput, marginText, parseDecimal, UNITS } from './units';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

interface FormState {
  name: string;
  /** A category's slug; empty until the list of categories has arrived (a new product). */
  category: string;
  priceAmd: string;
  weightLabel: string;
  description: string;
  stockQty: string;
  isNew: boolean;
  badges: string[];
  isActive: boolean;
  slug: string;
}

const EMPTY: FormState = {
  name: '',
  category: '',
  priceAmd: '',
  weightLabel: '',
  description: '',
  stockQty: '0',
  isNew: false,
  badges: [],
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
    badges: product.badges,
    isActive: product.isActive,
    slug: product.slug,
  };
}

const wholeNumber = (value: string) => /^\d+$/.test(value.trim());

/** The picker's last option: it opens a field for a new category instead of choosing one. */
const NEW_CATEGORY = '+new';

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
  const [video, setVideo] = useState<File | null>(null);
  /** What the save button says while it works; converting a video is the slow part. */
  const [progress, setProgress] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Себестоимость»: the warehouse's ingredients, and the composition as it is being typed. `savedComposition`
  // is what the server has, so an unchanged composition is not sent again; null until it has loaded.
  const warehouse = useLoad(() => adminApi.warehouse(), []);
  const compositionLoad = useLoad(() => (id === null ? Promise.resolve({ lines: [] }) : adminApi.composition(id)), [id]);
  const [composition, setComposition] = useState<CompositionDraft[]>([]);
  const [savedComposition, setSavedComposition] = useState<string | null>(id === null ? '[]' : null);

  useEffect(() => {
    if (!compositionLoad.data || savedComposition !== null) return;
    setComposition(compositionLoad.data.lines.map((line) => ({ ingredientId: String(line.ingredientId), qty: decimalInput(line.qty) })));
    setSavedComposition(JSON.stringify(compositionLoad.data.lines));
  }, [compositionLoad.data, savedComposition]);

  const categoryList = useLoad(() => adminApi.categories(), []);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  /** The name being typed for a new category, or null when the picker shows the list. */
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    if (!categoryList.data) return;
    setCategories(categoryList.data);
    // A new product starts in the first category.
    setForm((current) => (current.category ? current : { ...current, category: categoryList.data![0]?.slug ?? '' }));
  }, [categoryList.data]);

  async function addCategory() {
    const name = newCategory?.trim();
    if (!name || addingCategory) return;
    setAddingCategory(true);
    setError(null);
    try {
      const created = await adminApi.createCategory(name);
      setCategories((current) => [...current, created]);
      setForm((current) => ({ ...current, category: created.slug }));
      setNewCategory(null);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setAddingCategory(false);
    }
  }

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
    category: form.category ? null : 'Выберите категорию',
    priceAmd: wholeNumber(form.priceAmd) ? null : 'Цена — целое число в драмах',
    stockQty: wholeNumber(form.stockQty) ? null : 'Количество — целое число',
    slug: !form.slug.trim() || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug.trim()) ? null : 'Только латинские буквы, цифры и дефис',
    composition: parseComposition(composition) ? null : 'Заполните состав',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function choosePhoto(file: File | undefined) {
    setError(null);
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type)) return setError('Подойдут фото в формате JPG, PNG или WebP.');
    if (file.size > MAX_PHOTO_BYTES) return setError('Файл слишком большой. Максимум — 12 МБ.');
    setPhoto(file);
  }

  function chooseVideo(file: File | undefined) {
    setError(null);
    if (!file) return setVideo(null);
    if (!file.type.startsWith('video/')) return setError('Это не видео. Выберите ролик из галереи телефона.');
    if (file.size > MAX_VIDEO_BYTES) return setError('Видео слишком большое. Максимум — 100 МБ; ролик до минуты обычно меньше.');
    setVideo(file);
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
      badges: form.badges,
      isActive: form.isActive,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };

    setBusy(true);
    setError(null);
    setProgress('Сохраняем…');
    try {
      const saved = product ? await adminApi.updateProduct(product.id, input) : await adminApi.createProduct(input);
      // From here the product exists: a failed photo or video upload must not create it a second time.
      setProduct(saved.product);
      const lines = parseComposition(composition)!;
      // Only once the old composition has loaded: otherwise an empty form would wipe it.
      if (savedComposition !== null && JSON.stringify(lines) !== savedComposition) {
        const stored = await adminApi.setComposition(saved.product.id, lines);
        setSavedComposition(JSON.stringify(stored.lines));
      }
      if (photo) {
        setProduct((await adminApi.uploadImage(saved.product.id, photo)).product);
        setPhoto(null);
      }
      if (video) {
        setProgress('Загружаем и обрабатываем видео. Это может занять пару минут, не закрывайте страницу…');
        setProduct((await adminApi.uploadVideo(saved.product.id, video)).product);
        setVideo(null);
      }
      navigate('/admin/products');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function removeVideo() {
    if (!product || !window.confirm('Удалить видео товара?')) return;
    setBusy(true);
    setError(null);
    try {
      setProduct((await adminApi.deleteVideo(product.id)).product);
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
            {newCategory === null ? (
              <select
                id="product-category"
                className="field__input"
                value={form.category}
                onChange={(event) => (event.target.value === NEW_CATEGORY ? setNewCategory('') : set('category', event.target.value))}
              >
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ Новая категория…</option>
              </select>
            ) : (
              // Typing a new category in place: it is saved at once and chosen for this product.
              <div className="adm-category__name">
                <input
                  id="product-category"
                  className="field__input"
                  value={newCategory}
                  maxLength={40}
                  autoFocus
                  placeholder="Название новой категории"
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault(); // not the product form's submit
                      void addCategory();
                    } else if (event.key === 'Escape') {
                      setNewCategory(null);
                    }
                  }}
                />
                <button type="button" className="btn btn--primary" disabled={addingCategory || !newCategory.trim()} onClick={addCategory}>
                  Добавить
                </button>
                <button type="button" className="btn" disabled={addingCategory} onClick={() => setNewCategory(null)}>
                  Отмена
                </button>
              </div>
            )}
            {showErrors && errors.category && <p className="field__error">{errors.category}</p>}
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
          <h2>Видео</h2>
          {video ? (
            <p>
              Выбрано: <strong>{video.name}</strong> ({Math.max(1, Math.round(video.size / 1024 / 1024))} МБ). Оно
              загрузится и обработается, когда вы нажмёте «Сохранить».
            </p>
          ) : product?.videoPath ? (
            <video className="adm-video" src={product.videoPath} controls playsInline muted preload="metadata" />
          ) : (
            <p className="adm-muted">
              Видео пока нет. Подойдёт короткий ролик с телефона, до минуты. На сайте оно показывается без звука.
            </p>
          )}
          <div className="adm-actions">
            <label className="btn">
              {video || product?.videoPath ? 'Заменить видео' : 'Выбрать видео'}
              <input
                type="file"
                className="adm-file"
                accept="video/*"
                onChange={(event) => {
                  chooseVideo(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {video && (
              <button type="button" className="btn" onClick={() => setVideo(null)}>
                Отменить выбор
              </button>
            )}
            {!video && product?.videoPath && (
              <button type="button" className="btn adm-danger" disabled={busy} onClick={removeVideo}>
                Удалить видео
              </button>
            )}
          </div>
        </section>

        <section className="adm-card">
          <h2>Себестоимость</h2>
          {savedComposition === null ? (
            <LoadState error={compositionLoad.error} onRetry={compositionLoad.reload} />
          ) : (
            <CompositionEditor
              lines={composition}
              onChange={setComposition}
              ingredients={warehouse.data?.ingredients ?? null}
              priceAmd={wholeNumber(form.priceAmd) ? Number(form.priceAmd) : null}
              showErrors={showErrors}
            />
          )}
        </section>

        <section className="adm-card">
          <h2>Наличие и показ</h2>
          <Field
            label="На складе, шт."
            value={form.stockQty}
            onChange={(v) => set('stockQty', v)}
            required
            inputMode="numeric"
            hint="0 — товар закончился. С включённым предзаказом его можно заказать «под заказ», без него на сайте будет «Ожидается поставка»."
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
          <BadgesEditor value={form.badges} onChange={(badges) => set('badges', badges)} />
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
        {busy && progress && (
          <p className="alert" role="status">
            {progress}
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

/**
 * The owner's own labels on the product («Бест-селлер», «Острое»…): type one and press Enter or
 * «Добавить»; × takes one off. Labels used on other products are offered as he types.
 */
function BadgesEditor({ value, onChange }: { value: string[]; onChange: (badges: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const used = useLoad(() => adminApi.products(), []);
  const suggestions = [...new Set((used.data ?? []).flatMap((product) => product.badges))].filter((badge) => !value.includes(badge));
  const full = value.length >= PRODUCT_BADGES_MAX;

  function add() {
    const badge = draft.trim();
    if (!badge || full || value.includes(badge)) return;
    onChange([...value, badge]);
    setDraft('');
  }

  return (
    <div className="field adm-badges">
      <label className="field__label" htmlFor="product-badge">
        Свои плашки
      </label>
      {value.length > 0 && (
        <ul className="adm-badges__list">
          {value.map((badge) => (
            <li key={badge} className="badge badge--own">
              {badge}
              <button type="button" aria-label={`Убрать плашку «${badge}»`} onClick={() => onChange(value.filter((item) => item !== badge))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="adm-badges__add">
          <input
            id="product-badge"
            className="field__input"
            value={draft}
            maxLength={PRODUCT_BADGE_MAX_LENGTH}
            placeholder="Например: Бест-селлер"
            list="product-badge-suggestions"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn" disabled={!draft.trim()} onClick={add}>
            Добавить
          </button>
          <datalist id="product-badge-suggestions">
            {suggestions.map((badge) => (
              <option key={badge} value={badge} />
            ))}
          </datalist>
        </div>
      )}
      <p className="field__hint">
        Показываются на карточке товара рядом с «Новинкой». До {PRODUCT_BADGES_MAX} штук, по {PRODUCT_BADGE_MAX_LENGTH} знаков.
      </p>
    </div>
  );
}

/** One line of a composition as typed: an ingredient's id and a quantity, both as text. */
export interface CompositionDraft {
  ingredientId: string;
  qty: string;
}

/** The typed composition as the API takes it; null while a line is not filled in properly. */
export function parseComposition(lines: CompositionDraft[]): CompositionLine[] | null {
  const parsed = lines.map((line) => ({ ingredientId: Number(line.ingredientId), qty: parseDecimal(line.qty) }));
  if (parsed.some((line) => !line.ingredientId || line.qty === null || line.qty <= 0)) return null;
  return parsed as CompositionLine[];
}

/**
 * «Себестоимость»: how much of which ingredient one of the product takes, in grams (millilitres,
 * pieces). The cost and the profit are worked out as he types, at the warehouse's prices today.
 */
function CompositionEditor({
  lines,
  onChange,
  ingredients,
  priceAmd,
  showErrors,
}: {
  lines: CompositionDraft[];
  onChange: (lines: CompositionDraft[]) => void;
  ingredients: AdminIngredient[] | null;
  priceAmd: number | null;
  showErrors: boolean;
}) {
  if (!ingredients) return <p className="adm-muted">Загружаем склад…</p>;
  if (ingredients.length === 0) {
    return (
      <p className="adm-muted">
        На складе пока нет ингредиентов. Добавьте их на «<Link to="/admin/warehouse">Складе</Link>» — мясо, муку, пакеты, — и
        здесь можно будет указать, сколько чего уходит на одну штуку товара.
      </p>
    );
  }

  const byId = new Map(ingredients.map((ingredient) => [String(ingredient.id), ingredient]));
  const update = (index: number, patch: Partial<CompositionDraft>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const unused = ingredients.filter((ingredient) => !lines.some((line) => line.ingredientId === String(ingredient.id)));
  const parsed = parseComposition(lines);
  const cost = parsed ? compositionCost(parsed, ingredients) : null;
  const unpriced = lines
    .map((line) => byId.get(line.ingredientId))
    .filter((ingredient): ingredient is AdminIngredient => Boolean(ingredient && ingredient.unitCostAmd === 0));

  return (
    <>
      <p className="adm-muted">Сколько каких ингредиентов со склада уходит на одну штуку (одну пачку) этого товара.</p>
      {lines.length > 0 && (
        <ul className="adm-composition">
          {lines.map((line, index) => {
            const ingredient = byId.get(line.ingredientId);
            const qty = parseDecimal(line.qty);
            const bad = showErrors && (!ingredient || qty === null || qty <= 0);
            return (
              <li key={index} className={bad ? 'adm-composition__line adm-composition__line--error' : 'adm-composition__line'}>
                <select
                  className="field__input"
                  value={line.ingredientId}
                  aria-label="Ингредиент"
                  onChange={(event) => update(index, { ingredientId: event.target.value })}
                >
                  {!ingredient && <option value="">Выберите…</option>}
                  {ingredients
                    .filter((item) => String(item.id) === line.ingredientId || unused.includes(item))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <span className="adm-composition__qty">
                  <input
                    className="field__input"
                    inputMode="decimal"
                    value={line.qty}
                    aria-label={`Сколько, ${ingredient ? UNITS[ingredient.unit].small : ''}`}
                    placeholder="0"
                    onChange={(event) => update(index, { qty: event.target.value })}
                  />
                  <span>{ingredient ? UNITS[ingredient.unit].small : ''}</span>
                </span>
                <span className="adm-composition__cost adm-num">
                  {ingredient && qty !== null && qty > 0 ? formatAmd(Math.round(qty * ingredient.unitCostAmd)) : '—'}
                </span>
                <button
                  type="button"
                  className="link-btn adm-composition__remove"
                  aria-label={`Убрать ${ingredient?.name ?? 'строку'}`}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {unused.length > 0 && (
        <div>
          <button type="button" className="btn" onClick={() => onChange([...lines, { ingredientId: String(unused[0]!.id), qty: '' }])}>
            + Ингредиент
          </button>
        </div>
      )}
      {showErrors && !parsed && <p className="field__error">У каждой строки укажите ингредиент и количество больше нуля.</p>}
      {cost !== null && lines.length > 0 && (
        <p className="adm-composition__total">
          Себестоимость одной штуки: <strong>{formatAmd(cost)}</strong>
          {priceAmd !== null && (
            <>
              {' '}
              · прибыль с продажи по {formatAmd(priceAmd)}:{' '}
              <strong className={priceAmd - cost < 0 ? 'adm-minus' : undefined}>
                {formatAmd(priceAmd - cost)} ({marginText(priceAmd - cost, priceAmd)})
              </strong>
            </>
          )}
        </p>
      )}
      {unpriced.length > 0 && (
        <p className="adm-muted">
          У {unpriced.map((ingredient) => `«${ingredient.name}»`).join(', ')} ещё нет цены: запишите закупку на «
          <Link to="/admin/warehouse">Складе</Link>», иначе себестоимость будет меньше настоящей.
        </p>
      )}
      <p className="adm-muted">
        Заказы, оформленные раньше, сохраняют свою себестоимость: изменения здесь и цены закупок их не переписывают.
      </p>
    </>
  );
}
