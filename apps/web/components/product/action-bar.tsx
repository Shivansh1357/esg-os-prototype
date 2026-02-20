import { cn } from "@/lib/utils"

export default function ActionBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}
