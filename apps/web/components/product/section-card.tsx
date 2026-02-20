import { cn } from "@/lib/utils"

export default function SectionCard({
  title,
  right,
  children,
  className,
}: {
  title?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("glass-card rounded-xl border p-4 shadow-sm", className)}>
      {title || right ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h3 className="font-heading text-base font-semibold">{title}</h3> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  )
}
