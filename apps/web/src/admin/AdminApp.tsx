import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { IS_DEMO } from '../api';
import { Field } from '../components/Field';
import { LogoBadge } from '../components/Logo';
import '../styles/admin.css';
import { adminApi, ApiError, setUnauthorizedHandler } from './api';
import { CategoriesPage } from './Categories';
import { OrderPage, OrdersPage } from './Orders';
import { OrderStatsPage } from './OrderStats';
import { ProductFormPage } from './ProductForm';
import { ProductsPage } from './Products';
import { RequestsPage } from './Requests';
import { SettingsPage } from './SettingsPage';
import { errorText } from './shared';
import { TodayPage } from './Today';

type AuthState = 'checking' | 'in' | 'out' | 'off' | 'error';

// Absolute paths: the bar sits outside the nested <Routes>, where relative links
// would resolve against whatever admin page is open.
const TABS = [
  { to: '/admin', label: 'Сегодня', end: true },
  { to: '/admin/orders', label: 'Заказы', end: false },
  { to: '/admin/products', label: 'Товары', end: false },
  { to: '/admin/requests', label: 'Заявки', end: false },
  { to: '/admin/settings', label: 'Настройки', end: false },
];

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(password);
      onSignedIn();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-login panel" onSubmit={submit}>
      <LogoBadge className="adm-login__logo" />
      <h1>Вход для владельца</h1>
      <Field
        label="Пароль"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        autoFocus
        required
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
        {busy ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="adm-login panel">
      <h1>{title}</h1>
      {children}
      <Link to="/" className="more-link">
        ← На сайт
      </Link>
    </div>
  );
}

export default function AdminApp() {
  const [auth, setAuth] = useState<AuthState>('checking');

  useEffect(() => {
    document.title = 'Админ — Алёша Пельменыч';
    // Keep the panel out of search results.
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;
    setUnauthorizedHandler(() => setAuth('out'));
    adminApi
      .me()
      .then(() => setAuth('in'))
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) setAuth('out');
        else if (reason instanceof ApiError && reason.status === 503) setAuth('off');
        else setAuth('error');
      });
    return () => setUnauthorizedHandler(null);
  }, []);

  if (IS_DEMO) {
    return (
      <div className="adm adm--center">
        <Notice title="Админ-панель">
          <p>В демо-версии сайта админ-панели нет: она работает только вместе с сервером.</p>
        </Notice>
      </div>
    );
  }

  if (auth !== 'in') {
    return (
      <div className="adm adm--center">
        {auth === 'checking' && <p className="adm-muted">Загружаем…</p>}
        {auth === 'out' && <Login onSignedIn={() => setAuth('in')} />}
        {auth === 'off' && (
          <Notice title="Админ-панель выключена">
            <p>
              На сервере не задан пароль. Задайте его командой <code>npm run admin:password</code> и перезапустите
              сервер.
            </p>
          </Notice>
        )}
        {auth === 'error' && (
          <Notice title="Нет связи с сервером">
            <p>Проверьте интернет и обновите страницу.</p>
          </Notice>
        )}
      </div>
    );
  }

  async function signOut() {
    await adminApi.logout().catch(() => undefined);
    setAuth('out');
  }

  return (
    <div className="adm">
      <header className="adm-bar">
        <Link to="/admin" className="adm-bar__brand">
          <LogoBadge className="adm-bar__logo" />
          <span>Админ</span>
        </Link>
        <nav className="adm-tabs" aria-label="Разделы">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className="adm-tabs__link">
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="adm-bar__actions">
          <button type="button" className="adm-bar__out" onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>

      <main className="adm-main">
        <Routes>
          <Route index element={<TodayPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/stats" element={<OrderStatsPage />} />
          <Route path="orders/:id" element={<OrderPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/categories" element={<CategoriesPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id" element={<ProductFormPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <p>
                Такой страницы нет. <Link to="/admin">На главную админки</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
