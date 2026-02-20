'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useReportAwareLink } from '@/lib/useReportAwareLink'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/entities', label: 'Entities' },
  { href: '/data', label: 'Data Hub' },
  { href: '/emissions', label: 'Emissions' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/reports', label: 'Reports' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/exec', label: 'Exec' },
  { href: '/audit', label: 'Audit' },
  { href: '/pilot', label: 'Pilot' }
]

type AppNavProps = {
  className?: string
  itemClassName?: string
  orientation?: 'horizontal' | 'vertical'
  onNavigate?: () => void
}

export default function AppNav({
  className,
  itemClassName,
  orientation = 'horizontal',
  onNavigate,
}: AppNavProps) {
  return (
    <nav
      className={cn(
        'flex gap-2',
        orientation === 'horizontal' ? 'items-center' : 'flex-col',
        className
      )}
    >
      {NAV_ITEMS.map((item) => (
        <ReportAwareLink
          key={item.href}
          href={item.href}
          label={item.label}
          className={itemClassName}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function ReportAwareLink({
  href,
  label,
  className,
  onNavigate,
}: {
  href: string
  label: string
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const nextHref = useReportAwareLink(href)
  const active = pathname === href

  return (
    <Link
      href={nextHref}
      onClick={() => onNavigate?.()}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-primary/20 text-sidebar-primary dark:bg-sidebar-primary/30'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
    >
      {label}
    </Link>
  )
}
