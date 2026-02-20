import { cn } from "@/lib/utils"

export default function DataTableShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border/70 bg-card/75", className)}>
      {children}
    </div>
  )
}
