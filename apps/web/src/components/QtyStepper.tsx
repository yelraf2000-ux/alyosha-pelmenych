import { t } from '../i18n';

interface Props {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  /** What the minus button is called when it does more than lower the number (the cart: at 1 it takes the product out). */
  decreaseLabel?: string;
  onChange: (value: number) => void;
}

export function QtyStepper({ value, min = 1, max, disabled = false, decreaseLabel, onChange }: Props) {
  return (
    <div className="stepper" role="group" aria-label={t.product.qty}>
      <button
        type="button"
        className="stepper__btn"
        aria-label={decreaseLabel ?? t.product.decrease}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output className="stepper__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="stepper__btn"
        aria-label={t.product.increase}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
