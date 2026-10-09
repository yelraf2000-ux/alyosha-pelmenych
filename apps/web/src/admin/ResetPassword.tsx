import { ADMIN_PASSWORD_MIN_LENGTH } from '@alyosha/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Field } from '../components/Field';
import { Logo } from '../components/Logo';
import { adminApi } from './api';
import { errorText } from './shared';

/**
 * /admin/reset#<secret>: the page behind the link the Telegram bot sends for /password.
 * Open to anyone who has the link, signed in or not; the server checks the secret.
 */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  // The secret is the part of the address after «#».
  const [token] = useState(() => window.location.hash.slice(1));
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Once read, it is wiped from the address bar: the secret should not stay in the browser's
  // history or be copied along with the address.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      setError(`Пароль слишком короткий: нужно не меньше ${ADMIN_PASSWORD_MIN_LENGTH} символов.`);
      return;
    }
    if (password !== again) {
      setError('Пароли не совпадают. Введите один и тот же пароль дважды.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.resetPassword(token, password);
      setSaved(true);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="adm-login panel">
        <Logo className="adm-login__logo" />
        <h1>Пароль изменён</h1>
        <p className="adm-login__note">Теперь в админку пускает только новый пароль. На всех устройствах нужно войти заново.</p>
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={onDone}>
          Войти
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="adm-login panel">
        <Logo className="adm-login__logo" />
        <h1>Ссылка не подошла</h1>
        <p className="adm-login__note">
          Откройте ссылку прямо из сообщения бота. Если она устарела, отправьте боту <b>/password</b> ещё раз: он
          пришлёт новую.
        </p>
        <button type="button" className="btn btn--block btn--lg" onClick={onDone}>
          Ко входу
        </button>
      </div>
    );
  }

  return (
    <form className="adm-login panel" onSubmit={submit}>
      <Logo className="adm-login__logo" />
      <h1>Новый пароль</h1>
      <Field
        label="Новый пароль"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={`Не меньше ${ADMIN_PASSWORD_MIN_LENGTH} символов.`}
        autoFocus
        required
      />
      <Field
        label="Ещё раз"
        type="password"
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        required
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
        {busy ? 'Сохраняем…' : 'Сохранить пароль'}
      </button>
    </form>
  );
}
