import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export default function LoadingState({
  label = "Loading…",
  className,
  testId,
}: {
  label?: string
  className?: string
  testId?: string
}) {
  return (
    <div
      data-test={testId}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground",
        className
      )}
    >
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
