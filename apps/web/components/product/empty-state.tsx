import { Inbox } from "lucide-react"

export default function EmptyState({
  title,
  subtitle,
  action,
  testId,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  testId?: string
}) {
  return (
    <div
      data-test={testId}
      className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-center"
    >
      <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
