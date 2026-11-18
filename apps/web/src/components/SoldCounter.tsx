import { useEffect, useState } from 'react';
import { getSoldCount } from '../api';
import { t } from '../i18n';

/** How often the counter asks for the latest number while the page is open. */
const REFRESH_MS = 30_000;

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const number = new Intl.NumberFormat('ru-RU');

/** One window of the odometer: a reel of 0–9 that turns to `value`. */
function Digit({ value, groupStart }: { value: number; groupStart: boolean }) {
  return (
    <span className={groupStart ? 'odo__digit odo__digit--group' : 'odo__digit'}>
      <span className="odo__reel" style={{ transform: `translateY(${-value * 10}%)` }}>
        {DIGITS.map((digit) => (
          <span key={digit}>{digit}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * «🥟 12 480 пельменей продано»: a live counter at the top of every page, counted from the orders
 * of the products the owner ticked in the admin. The digits roll like an odometer — from zero when
 * the page opens, and on to the new number whenever a sale comes in (it asks every 30 seconds and
 * when the tab comes back into view). Hidden while there is nothing to show or it cannot load.
 */
export function SoldCounter() {
  const [target, setTarget] = useState(0);
  // What the reels show: zero at first, so that they roll up to the number once it has arrived.
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      getSoldCount()
        .then((sold) => alive && setTarget(sold.pieces))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  useEffect(() => {
    if (target <= 0) return;
    // A moment later, so the reels are on the page at their old place and the turn is animated.
    // A timer, not requestAnimationFrame: that one never fires while the page is not being drawn
    // (a tab in the background), and the reels would stay on the old number.
    const timer = window.setTimeout(() => setShown(target), 60);
    return () => window.clearTimeout(timer);
  }, [target]);

  if (target <= 0) return null;

  // As many reels as the new number needs; the old one is padded with zeros on the left.
  const digits = String(target).split('').map(Number);
  const before = String(shown).padStart(digits.length, '0').slice(-digits.length).split('').map(Number);
  const reels = shown === target ? digits : before;

  return (
    <div className="sold">
      {/* Screen readers get the number in words once; the rolling reels are for the eye. */}
      <p className="sold__text">{`${t.sold.before} ${number.format(target)} ${t.sold.after(target)}`}</p>
      <div className="sold__row" aria-hidden="true">
        <span className="sold__icon">🥟</span>
        <span className="odo">
          {reels.map((digit, index) => (
            <Digit
              key={digits.length - index}
              value={digit}
              // A little gap before every group of three, counted from the right: 12 480.
              groupStart={index > 0 && (digits.length - index) % 3 === 0}
            />
          ))}
        </span>
        <span className="sold__label">
          {t.sold.after(target)} {t.sold.done}
        </span>
        <span className="sold__live" title={t.sold.live}>
          <span className="sold__dot" />
          {t.sold.live}
        </span>
      </div>
    </div>
  );
}
