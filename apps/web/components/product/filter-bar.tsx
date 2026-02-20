import { cn } from "@/lib/utils"

export default function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mb-3 grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]",
        className
      )}
    >
      {children}
    </div>
  )
}
