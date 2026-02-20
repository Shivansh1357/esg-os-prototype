import { cn } from "@/lib/utils"

type Tone = "info" | "success" | "warning" | "danger"

const toneMap: Record<Tone, string> = {
  info: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/35 bg-success/15 text-success",
  warning: "border-warning/35 bg-warning/15 text-warning-foreground",
  danger: "border-destructive/35 bg-destructive/15 text-destructive",
}

export default function StatusBanner({
  tone = "info",
  children,
  className,
  testId,
}: {
  tone?: Tone
  children: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      data-test={testId}
      className={cn(
        "mb-3 rounded-lg border px-3 py-2.5 text-sm font-medium",
        toneMap[tone],
        className
      )}
    >
      {children}
    </div>
  )
}
