import { Link } from 'react-router-dom';
import { ContactsList, DeliveryCards } from '../components/InfoBlocks';
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
    <div className="section container narrow prose">
      <h1>{t.nav.about}</h1>
      <Text text={settings.aboutText} />
    </div>
  );
}

export function DeliveryPage() {
  useTitle(t.nav.delivery);
  const { settings } = useShop();
  if (!settings) return null;
  return (
    <div className="section container narrow prose">
      <h1>{t.nav.delivery}</h1>
      <DeliveryCards settings={settings} />
      <Text text={settings.deliveryText} />
    </div>
  );
}

export function ContactsPage() {
  useTitle(t.nav.contacts);
  const { settings } = useShop();
  if (!settings) return null;
  return (
    <div className="section container narrow prose">
      <h1>{t.nav.contacts}</h1>
      <ContactsList settings={settings} />
      <Text text={settings.contactsText} />
      <h2>{t.delivery.pickupTitle}</h2>
      <p>{settings.pickupAddress}</p>
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
