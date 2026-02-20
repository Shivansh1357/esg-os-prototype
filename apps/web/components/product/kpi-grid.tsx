import { cn } from "@/lib/utils"

export default function KpiGrid({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
