import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VariantProps } from 'class-variance-authority'
import React from 'react'

type LinkButtonProps = {
  href: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  external?: boolean
} & VariantProps<typeof buttonVariants>

export function LinkButton({ href, className, style, variant, size, children, external }: LinkButtonProps) {
  const cls = cn(buttonVariants({ variant, size }), className)
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{children}</a>
  }
  return <Link href={href} className={cls} style={style}>{children}</Link>
}

export function AnchorButton({
  href,
  className,
  style,
  variant,
  size,
  children,
  ...rest
}: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode } & VariantProps<typeof buttonVariants> & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const cls = cn(buttonVariants({ variant, size }), className)
  return <a href={href} className={cls} style={style} {...rest}>{children}</a>
}
