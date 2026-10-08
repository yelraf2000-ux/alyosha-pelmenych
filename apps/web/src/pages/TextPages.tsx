import { Link } from 'react-router-dom';
import { AboutPhoto } from '../components/InfoBlocks';
import { t } from '../i18n';
import { paragraphs } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useShop } from '../state/ShopContext';

function Text({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

export function AboutPage() {
  useTitle(t.nav.about);
  const { settings } = useShop();
  if (!settings) return null;
  return (
    <div className="section container about about--page">
      <AboutPhoto />
      <div className="prose">
        <h1>{t.nav.about}</h1>
        <Text text={settings.aboutText} />
      </div>
    </div>
  );
}

export function NotFoundPage() {
  useTitle(t.notFound.title);
  return (
    <div className="section container narrow state">
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.text}</p>
      <Link to="/catalog" className="btn btn--primary">
        {t.product.toCatalog}
      </Link>
    </div>
  );
}
