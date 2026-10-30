import type { HTMLAttributes } from 'react'
import styles from './Alert.module.css'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'danger'
}

export function Alert({ tone = 'info', className, ...rest }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={[styles.alert, styles[tone], className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
