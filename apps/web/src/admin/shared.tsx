import type { OrderStatus } from '@alyosha/shared';
import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from 'react';
import { telHref } from '../lib/format';
import { ApiError } from './api';

// The admin is used by one Russian-speaking owner, so its texts are written in place
// rather than going through the storefront's translation dictionary.

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

const ERROR_TEXTS: Record<string, string> = {
  wrong_password: 'Неверный пароль.',
  rate_limited: 'Слишком много попыток. Подождите 15 минут и попробуйте снова.',
  invalid: 'Проверьте заполненные поля.',
  not_found: 'Не найдено. Возможно, это уже удалили.',
  slug_taken: 'Такой адрес страницы уже занят другим товаром.',
  has_orders: 'Этот товар есть в заказах, удалить его нельзя. Снимите галочку «На сайте», чтобы скрыть его.',
  bad_image: 'Это не похоже на фото. Подойдут JPG, PNG или WebP.',
  too_large: 'Файл слишком большой. Фото — до 12 МБ, видео — до 100 МБ.',
  bad_video: 'Не получилось прочитать это видео. Подойдёт обычный ролик с телефона (MP4 или MOV).',
  video_busy: 'Сейчас обрабатывается другое видео. Подождите минуту и попробуйте ещё раз.',
  insufficient_stock: 'Не хватает товара на складе.',
  has_products: 'В этой категории есть товары. Сначала перенесите их в другую.',
  forbidden_origin: 'Запрос отклонён. Откройте админку по адресу сайта и попробуйте снова.',
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return ERROR_TEXTS[error.code] ?? 'Что-то пошло не так. Попробуйте ещё раз.';
  }
  return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
}

const dateTime = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/**
 * Loads data for a page. With `refreshOnFocus` the data is loaded again whenever the owner
 * comes back to the tab — lists should be fresh; forms being edited must not be.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList, options: { refreshOnFocus?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const reload = useCallback(() => {
    const call = ++latest.current;
    setLoading(true);
    load()
      .then((result) => {
        if (latest.current !== call) return;
        setData(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (latest.current === call) setError(errorText(reason));
      })
      .finally(() => {
        if (latest.current === call) setLoading(false);
      });
    // `load` is recreated on every render; the caller lists what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
    return () => {
      latest.current += 1;
    };
  }, [reload]);

  const refreshOnFocus = options.refreshOnFocus ?? false;
  useEffect(() => {
    if (!refreshOnFocus) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshOnFocus, reload]);

  return { data, setData, error, loading, reload };
}

/** Shown in place of a page while its data is loading or failed to load. */
export function LoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return <p className="adm-muted">Загружаем…</p>;
  return (
    <div className="alert alert--error" role="alert">
      <p>{error}</p>
      <button type="button" className="link-btn" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="adm-head">
      <h1>{title}</h1>
      {children && <div className="adm-head__actions">{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`adm-status adm-status--${status}`}>{STATUS_LABELS[status]}</span>;
}

/** One-tap ways to reach a buyer (SPEC §7). */
export function ContactLinks({ phone, telegram }: { phone: string; telegram: string | null }) {
  return (
    <div className="adm-contacts">
      <a className="btn" href={telHref(phone)}>
        Позвонить {phone}
      </a>
      {telegram && (
        <a className="btn" href={`https://t.me/${telegram}`} target="_blank" rel="noreferrer">
          Telegram @{telegram}
        </a>
      )}
    </div>
  );
}
