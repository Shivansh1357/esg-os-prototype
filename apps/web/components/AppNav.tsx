'use client'

import Link from 'next/link'
import { useReportAwareLink } from '@/lib/useReportAwareLink'

const items = [
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

export default function AppNav() {
  return (
    <nav style={{ display: 'flex', gap: 16 }}>
      {items.map((item) => (
        <ReportAwareLink key={item.href} href={item.href} label={item.label} />
      ))}
    </nav>
  )
}

function ReportAwareLink({ href, label }: { href: string; label: string }) {
  const nextHref = useReportAwareLink(href)
  return <Link href={nextHref}>{label}</Link>
}
