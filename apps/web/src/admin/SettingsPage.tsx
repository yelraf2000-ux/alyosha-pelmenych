import type { Settings } from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Field } from '../components/Field';
import { adminApi, ApiError } from './api';
import { errorText, LoadState, PageHead, useLoad } from './shared';

type FormState = Record<keyof Settings, string>;

interface FieldSpec {
  key: keyof Settings;
  label: string;
  hint?: string;
  multiline?: boolean;
  numeric?: boolean;
}

// Every key from SPEC §5 `Setting`, grouped the way the owner thinks about them.
const GROUPS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: 'Главная страница',
    fields: [
      { key: 'heroTitle', label: 'Заголовок' },
      { key: 'heroSubtitle', label: 'Подзаголовок' },
    ],
  },
  {
    title: 'Доставка',
    fields: [
      { key: 'pickupAddress', label: 'Адрес самовывоза' },
      { key: 'courierFeeAmd', label: 'Стоимость доставки курьером, ֏', numeric: true },
      {
        key: 'freeDeliveryFromAmd',
        label: 'Бесплатная доставка от, ֏',
        numeric: true,
        hint: 'Если сумма товаров не меньше этой, доставка бесплатная. 0 — доставка всегда бесплатная.',
      },
      { key: 'deliveryNote', label: 'Примечание о доставке', hint: 'Например: «Заказы после 15:00 — на следующий день».' },
    ],
  },
  {
    title: 'Тексты страниц',
    fields: [
      { key: 'aboutText', label: 'О нас', multiline: true, hint: 'Пустая строка начинает новый абзац. Первый абзац показывается на главной.' },
      { key: 'deliveryText', label: 'Доставка и оплата', multiline: true },
      { key: 'contactsText', label: 'Контакты', multiline: true },
    ],
  },
  {
    title: 'Контакты на сайте',
    fields: [
      { key: 'phonePublic', label: 'Телефон' },
      { key: 'telegramPublic', label: 'Telegram', hint: 'Имя пользователя, например @alyosha. Пусто — ссылки не будет.' },
      { key: 'instagramUrl', label: 'Instagram', hint: 'Ссылка целиком, начиная с https://. Пусто — ссылки не будет.' },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

function toForm(settings: Settings): FormState {
  return Object.fromEntries(ALL_FIELDS.map((field) => [field.key, String(settings[field.key])])) as FormState;
}

export function SettingsPage() {
  const loaded = useLoad(() => adminApi.settings(), []);
  const [form, setForm] = useState<FormState | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded.data && !form) setForm(toForm(loaded.data));
  }, [loaded.data, form]);

  if (!form) {
    return (
      <>
        <PageHead title="Настройки" />
        <LoadState error={loaded.error} onRetry={loaded.reload} />
      </>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || busy) return;

    const notNumbers = ALL_FIELDS.filter((field) => field.numeric && !/^\d+$/.test(form[field.key].trim())).map(
      (field) => field.key as string,
    );
    setBadFields(notNumbers);
    setSaved(false);
    if (notNumbers.length > 0) return setError('В полях с суммами должны быть целые числа.');

    const values = Object.fromEntries(
      ALL_FIELDS.map((field) => [field.key, field.numeric ? Number(form[field.key]) : form[field.key]]),
    ) as unknown as Settings;

    setBusy(true);
    setError(null);
    try {
      setForm(toForm(await adminApi.saveSettings(values)));
      setSaved(true);
    } catch (reason) {
      setError(errorText(reason));
      if (reason instanceof ApiError && reason.body?.fields) setBadFields(reason.body.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Настройки" />
      <form className="adm-form" onSubmit={submit} noValidate>
        {GROUPS.map((group) => (
          <section key={group.title} className="adm-card">
            <h2>{group.title}</h2>
            {group.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChange={(value) => {
                  setSaved(false);
                  setForm({ ...form, [field.key]: value });
                }}
                multiline={field.multiline}
                inputMode={field.numeric ? 'numeric' : undefined}
                hint={field.hint}
                error={badFields.includes(field.key) ? 'Проверьте это поле' : null}
              />
            ))}
          </section>
        ))}

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="alert" role="status">
            Сохранено. На сайте уже новые данные.
          </p>
        )}
        <div className="adm-form__submit">
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </>
  );
}
