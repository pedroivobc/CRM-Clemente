import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VariantProps } from 'class-variance-authority'

type LinkButtonProps = {
  href: string
  className?: string
  children: React.ReactNode
  external?: boolean
} & VariantProps<typeof buttonVariants>

export function LinkButton({ href, className, variant, size, children, external }: LinkButtonProps) {
  const cls = cn(buttonVariants({ variant, size }), className)
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>
  }
  return <Link href={href} className={cls}>{children}</Link>
}

export function AnchorButton({
  href,
  className,
  variant,
  size,
  children,
  ...rest
}: { href: string; className?: string; children: React.ReactNode } & VariantProps<typeof buttonVariants> & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const cls = cn(buttonVariants({ variant, size }), className)
  return <a href={href} className={cls} {...rest}>{children}</a>
}
