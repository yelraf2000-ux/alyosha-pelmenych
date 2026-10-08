import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createStockRequest } from '../api';
import { t } from '../i18n';
import { normalizePhone, normalizeTelegram, validateName, validatePhone, validateTelegram } from '../lib/validation';
import type { Product } from '../types';
import { Field } from './Field';

export function NotifyModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const errors = {
    name: validateName(name),
    phone: validatePhone(phone),
    telegram: validateTelegram(telegram),
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    const normalizedPhone = normalizePhone(phone);
    if (errors.name || errors.phone || errors.telegram || !normalizedPhone) return;

    setStatus('sending');
    try {
      await createStockRequest({
        productId: product.id,
        name: name.trim(),
        phone: normalizedPhone,
        telegram: telegram.trim() ? normalizeTelegram(telegram) : null,
      });
      setStatus('done');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="notify-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal__body">
        <button type="button" className="modal__close" aria-label={t.close} onClick={onClose}>
          ×
        </button>

        {status === 'done' ? (
          <div className="modal__done">
            <h2 id="notify-title">{t.notify.doneTitle}</h2>
            <p>{t.notify.doneText}</p>
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              {t.close}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h2 id="notify-title">{t.notify.title}</h2>
            <p className="modal__text">{t.notify.text(product.name)}</p>
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
              hint={t.form.telegramHint}
              error={showErrors ? errors.telegram : null}
            />
            {status === 'failed' && (
              <p className="alert alert--error" role="alert">
                {t.notify.error}
              </p>
            )}
            <button type="submit" className="btn btn--primary btn--block" disabled={status === 'sending'}>
              {status === 'sending' ? t.notify.sending : t.notify.submit}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
