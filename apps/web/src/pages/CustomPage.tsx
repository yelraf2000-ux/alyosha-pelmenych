import {
  CUSTOM_EXCLUSIVE_GROUPS,
  CUSTOM_MAX_GRAMS,
  CUSTOM_MIN_GRAMS,
  CUSTOM_NAME_MAX,
  CUSTOM_STEP_GRAMS,
  formatKg,
  optionLines,
} from '@alyosha/shared';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { submitCustomOrder } from '../api';
import { Field } from '../components/Field';
import { TelegramFollow } from '../components/TelegramFollow';
import { t } from '../i18n';
import { useTitle } from '../lib/useTitle';
import { normalizePhone, normalizeTelegram, validateName, validatePhone, validateTelegram } from '../lib/validation';
import { useShop } from '../state/ShopContext';

function Step({ number, title, error, children }: { number: number; title: string; error?: string | null; children: ReactNode }) {
  return (
    <fieldset className={`panel custom__step${error ? ' custom__step--error' : ''}`}>
      <legend>
        <span className="custom__num" aria-hidden="true">
          {number}
        </span>
        {title}
      </legend>
      {children}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Adds or removes `option`; adding one of an exclusive pair («Меньше соли» / «Без соли») drops the other. */
function toggle(chosen: string[], option: string): string[] {
  if (chosen.includes(option)) return chosen.filter((item) => item !== option);
  const rivals = CUSTOM_EXCLUSIVE_GROUPS.find((group) => group.includes(option)) ?? [];
  return [...chosen.filter((item) => !rivals.includes(item)), option];
}

/**
 * «Свой рецепт»: the buyer puts together пельмени of their own (base, additions, spices, a name),
 * says how much and leaves contacts. It is a request, not a cart order: there is no price on the
 * site, the owner calls back with one. What can be chosen comes from the shop's settings.
 */
export default function CustomPage() {
  useTitle(t.custom.title);
  const { settings } = useShop();
  const formRef = useRef<HTMLFormElement>(null);

  const [base, setBase] = useState('');
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [spices, setSpices] = useState<string[]>([]);
  const [recipeName, setRecipeName] = useState('');
  const [grams, setGrams] = useState(CUSTOM_MIN_GRAMS);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** Set once the request is in: the link to the shop's Telegram bot for it, or null if there is no bot. */
  const [sent, setSent] = useState<{ telegramLink: string | null } | null>(null);

  const bases = useMemo(() => optionLines(settings?.customBases ?? ''), [settings]);
  const offeredModifiers = useMemo(() => optionLines(settings?.customModifiers ?? ''), [settings]);
  const offeredSpices = useMemo(() => optionLines(settings?.customSpices ?? ''), [settings]);

  if (!settings) return null;

  if (sent) {
    return (
      <div className="section container narrow success">
        <div className="success__mark" aria-hidden="true">
          <span>✓</span>
        </div>
        <h1>{t.custom.sentTitle}</h1>
        <p className="lead">{t.custom.sentText}</p>
        <TelegramFollow link={sent.telegramLink} />
        <div className="success__links">
          <Link to="/" className="btn btn--primary">
            {t.success.toHome}
          </Link>
        </div>
      </div>
    );
  }

  // No bases in the settings is the owner's way of switching the page off.
  if (bases.length === 0) {
    return (
      <div className="section container narrow state">
        <h1>{t.custom.title}</h1>
        <p>{t.custom.unavailable}</p>
        <Link to="/" className="btn btn--primary">
          {t.success.toHome}
        </Link>
      </div>
    );
  }

  const errors = {
    base: base ? null : t.custom.errors.base,
    recipeName: recipeName.trim() ? null : t.custom.errors.recipeName,
    name: validateName(name),
    phone: validatePhone(phone),
    telegram: validateTelegram(telegram),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setFailure(null);
    if (hasErrors) {
      // Bring the first problem into view: the button is far below the first steps.
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('.custom__step--error, [aria-invalid="true"]');
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (first?.matches('[aria-invalid="true"]')) first.focus({ preventScroll: true });
      });
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const result = await submitCustomOrder({
        recipeName: recipeName.trim(),
        base,
        modifiers,
        spices,
        weightGrams: grams,
        customerName: name.trim(),
        customerPhone: normalizePhone(phone) ?? phone,
        customerTelegram: telegram.trim() ? normalizeTelegram(telegram) : null,
        comment: comment.trim() || null,
        website,
      });
      if (result.ok) {
        setSent({ telegramLink: result.telegramLink });
        window.scrollTo({ top: 0 });
      } else {
        setFailure(result.error === 'rate_limited' ? t.checkout.rateLimited : t.custom.failed);
      }
    } catch {
      setFailure(t.custom.failed);
    } finally {
      setSubmitting(false);
    }
  }

  const list = (options: string[]) => (options.length > 0 ? options.join(', ') : t.custom.none);

  return (
    <div className="section container custom">
      <header className="custom__head">
        <h1>{t.custom.title}</h1>
        <p className="lead custom__lead">{t.custom.lead}</p>
        <ul className="custom__facts">
          <li>{t.custom.factMin(formatKg(CUSTOM_MIN_GRAMS))}</li>
          <li>{t.custom.factReady}</li>
          <li>{t.custom.factPrice}</li>
        </ul>
      </header>

      <form className="split" ref={formRef} onSubmit={handleSubmit} noValidate>
        <div className="checkout">
          <Step number={1} title={t.custom.stepBase} error={showErrors ? errors.base : null}>
            <div className="chips" role="radiogroup" aria-label={t.custom.stepBase}>
              {bases.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={base === option}
                  className={`chip${base === option ? ' chip--active' : ''}`}
                  onClick={() => setBase(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </Step>

          {offeredModifiers.length > 0 && (
            <Step number={2} title={t.custom.stepModifiers}>
              <div className="chips" role="group" aria-label={t.custom.stepModifiers}>
                {offeredModifiers.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={modifiers.includes(option)}
                    className={`chip${modifiers.includes(option) ? ' chip--active' : ''}`}
                    onClick={() => setModifiers((chosen) => toggle(chosen, option))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Step>
          )}

          {offeredSpices.length > 0 && (
            <Step number={3} title={t.custom.stepSpices}>
              <div className="chips" role="group" aria-label={t.custom.stepSpices}>
                {offeredSpices.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={spices.includes(option)}
                    className={`chip${spices.includes(option) ? ' chip--active' : ''}`}
                    onClick={() => setSpices((chosen) => toggle(chosen, option))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Step>
          )}

          <Step number={4} title={t.custom.stepName}>
            <Field
              label={t.custom.nameLabel}
              value={recipeName}
              onChange={setRecipeName}
              required
              maxLength={CUSTOM_NAME_MAX}
              hint={t.custom.nameHint}
              error={showErrors ? errors.recipeName : null}
            />
          </Step>

          <fieldset className="panel">
            <legend>{t.custom.weightTitle}</legend>
            <div className="custom__weight">
              <div className="stepper" role="group" aria-label={t.custom.weightTitle}>
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label={t.product.decrease}
                  disabled={grams <= CUSTOM_MIN_GRAMS}
                  onClick={() => setGrams((value) => Math.max(CUSTOM_MIN_GRAMS, value - CUSTOM_STEP_GRAMS))}
                >
                  −
                </button>
                <output className="stepper__value custom__kg" aria-live="polite">
                  {formatKg(grams)}
                </output>
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label={t.product.increase}
                  disabled={grams >= CUSTOM_MAX_GRAMS}
                  onClick={() => setGrams((value) => Math.min(CUSTOM_MAX_GRAMS, value + CUSTOM_STEP_GRAMS))}
                >
                  +
                </button>
              </div>
              <p className="muted small">{t.custom.weightHint(formatKg(CUSTOM_MIN_GRAMS))}</p>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>{t.checkout.contactsTitle}</legend>
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
              error={showErrors ? errors.telegram : null}
            />
            <Field label={t.form.comment} value={comment} onChange={setComment} multiline />

            {/* Honeypot: hidden from people, tempting for bots. */}
            <div className="hp" aria-hidden="true">
              <label>
                {t.checkout.hp}
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
            </div>
          </fieldset>
        </div>

        <aside className="summary">
          <h2>{t.custom.summaryTitle}</h2>
          <dl className="custom__recipe">
            <div>
              <dt>{t.custom.summaryName}</dt>
              <dd>{recipeName.trim() ? `«${recipeName.trim()}»` : t.custom.none}</dd>
            </div>
            <div>
              <dt>{t.custom.summaryBase}</dt>
              <dd>{base || t.custom.none}</dd>
            </div>
            {offeredModifiers.length > 0 && (
              <div>
                <dt>{t.custom.summaryModifiers}</dt>
                <dd>{list(modifiers)}</dd>
              </div>
            )}
            {offeredSpices.length > 0 && (
              <div>
                <dt>{t.custom.summarySpices}</dt>
                <dd>{list(spices)}</dd>
              </div>
            )}
            <div>
              <dt>{t.custom.summaryWeight}</dt>
              <dd>{formatKg(grams)}</dd>
            </div>
          </dl>

          {showErrors && hasErrors && (
            <p className="alert alert--error" role="alert">
              {t.checkout.fixErrors}
            </p>
          )}
          {failure && (
            <p className="alert alert--error" role="alert">
              {failure}
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
            {submitting ? t.checkout.submitting : t.custom.submit}
          </button>
          <p className="muted small">{t.custom.afterSubmit}</p>
        </aside>
      </form>
    </div>
  );
}
