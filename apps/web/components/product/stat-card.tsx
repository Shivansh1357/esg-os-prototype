import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function StatCard({
  label,
  value,
  hint,
  testId,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  testId?: string
  className?: string
}) {
  return (
    <Card className={cn("glass-card shadow-sm", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div data-test={testId} className="text-2xl font-semibold tracking-tight">
          {value}
        </div>
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
