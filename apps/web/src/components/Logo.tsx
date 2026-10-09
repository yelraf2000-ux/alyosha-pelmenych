import { t } from '../i18n';

// The logo is Алексей's own picture, not a redrawing of it. scripts/logo/build.mjs cuts two
// squares out of the picture he sent: one as it is, on its light blue background (the page rounds
// it into a disc), and one with the blue taken away.
export const LOGO_SRC = '/logo/logo-720.webp';
const LOGO_BARE_SRC = '/logo/logo-bare-720.webp';

/**
 * The round logo. `bare` lays the version without the blue background over it, invisible until
 * the styles ask for it: the header and the entry animation fade from one to the other
 * (`.logo__bare` in components.css).
 */
export function Logo({ className, bare = false }: { className?: string; bare?: boolean }) {
  return (
    <span className={className ? `logo ${className}` : 'logo'} role="img" aria-label={t.brand}>
      <img className="logo__disc" src={LOGO_SRC} alt="" width="720" height="720" decoding="async" />
      {bare && <img className="logo__bare" src={LOGO_BARE_SRC} alt="" width="720" height="720" decoding="async" />}
    </span>
  );
}
