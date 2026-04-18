import { cn } from "@/lib/utils"

export default function DataTableShell({
  children,
  className,
  testId,
}: {
  children: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      data-test={testId}
      className={cn("overflow-x-auto rounded-xl border border-border/70 bg-card/75", className)}
    >
      {children}
    </div>
  )
}
