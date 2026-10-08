import { useId, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
}

export function Field({ label, value, onChange, hint, error, multiline = false, required, ...rest }: Props) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className="field__input"
          rows={3}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="field__input"
          value={value}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
