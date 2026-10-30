import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { color, fontSize, space, type ColorToken, type FontSize, type Space } from '../theme/tokens'
import styles from './Layout.module.css'

export interface StackProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  direction?: 'row' | 'column'
  gap?: Space
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  wrap?: boolean
}

export function Stack({
  as: Tag = 'div',
  direction = 'column',
  gap = 4,
  align,
  justify,
  wrap,
  style,
  ...rest
}: StackProps) {
  return (
    <Tag
      style={{
        display: 'flex',
        flexDirection: direction,
        gap: space[gap],
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
      {...rest}
    />
  )
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  padding?: Space
  interactive?: boolean
}

export function Card({ as: Tag = 'div', padding = 6, interactive, className, style, ...rest }: CardProps) {
  return (
    <Tag
      className={[styles.card, interactive && styles.interactive, className].filter(Boolean).join(' ')}
      style={{ padding: space[padding], ...style }}
      {...rest}
    />
  )
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  size?: FontSize
  tone?: ColorToken
  weight?: 'regular' | 'medium' | 'bold'
  children?: ReactNode
}

export function Text({ as: Tag = 'p', size = 'md', tone = 'text', weight = 'regular', style, ...rest }: TextProps) {
  return (
    <Tag
      style={{
        fontSize: fontSize[size],
        color: color[tone],
        fontWeight: `var(--weight-${weight})`,
        ...style,
      }}
      {...rest}
    />
  )
}
