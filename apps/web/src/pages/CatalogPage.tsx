import { Catalog } from '../components/Catalog';
import { t } from '../i18n';
import { useTitle } from '../lib/useTitle';

export default function CatalogPage() {
  useTitle(t.catalog.title);
  return (
    <div className="section container">
      <h1>{t.catalog.title}</h1>
      <Catalog />
    </div>
  );
}
