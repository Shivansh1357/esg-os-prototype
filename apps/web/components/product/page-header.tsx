import { cn } from "@/lib/utils"

export default function PageHeader({
  title,
  description,
  right,
  className,
}: {
  title: string
  description?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur-sm md:mb-5",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-end gap-2">{right}</div> : null}
    </header>
  )
}
