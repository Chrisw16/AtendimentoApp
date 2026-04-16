import { forwardRef } from 'react';
import styles from './Button.module.css';

/**
 * Button
 * variants: primary | secondary | ghost | danger | accent
 * sizes: sm | md | lg
 */
const Button = forwardRef(({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconRight: IconRight,
  children,
  className = '',
  ...props
}, ref) => {
  const cls = [
    styles.btn,
    styles[`btn-${variant}`],
    styles[`btn-${size}`],
    loading && styles.loading,
    !children && (Icon || IconRight) && styles['btn-icon-only'],
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      className={cls}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {!loading && Icon && <Icon size={size === 'sm' ? 13 : size === 'lg' ? 17 : 14} />}
      {children && <span>{children}</span>}
      {!loading && IconRight && <IconRight size={size === 'sm' ? 13 : size === 'lg' ? 17 : 14} />}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
