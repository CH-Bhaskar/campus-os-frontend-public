import styles from './Spinner.module.css'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Accessible label. Pass an empty string when the spinner is decorative. */
  label?: string
}

export function Spinner({ size = 'md', label = 'Loading' }: SpinnerProps) {
  const decorative = label === ''
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    />
  )
}
