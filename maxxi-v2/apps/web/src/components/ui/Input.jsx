import { forwardRef } from 'react';
import styles from './Input.module.css';

/**
 * Input
 * Suporta: label, hint, error, prefix (ícone/texto), suffix, size
 */
const Input = forwardRef(({
  label,
  hint,
  error,
  size = 'md',
  prefix: Prefix,
  suffix: Suffix,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={[
        styles.field,
        styles[`field-${size}`],
        error && styles['field-error'],
        props.disabled && styles['field-disabled'],
      ].filter(Boolean).join(' ')}>
        {Prefix && (
          <span className={styles.prefix}>
            {typeof Prefix === 'string' ? Prefix : <Prefix size={14} />}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={styles.input}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {Suffix && (
          <span className={styles.suffix}>
            {typeof Suffix === 'string' ? Suffix : <Suffix size={14} />}
          </span>
        )}
      </div>
      {error && (
        <span id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
      {!error && hint && (
        <span id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
