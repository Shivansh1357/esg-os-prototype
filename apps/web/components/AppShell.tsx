"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { ChevronRight, Menu, Search } from "lucide-react"
import AppNav, { NAV_ITEMS } from "@/components/AppNav"
import ThemeToggle from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const crumb = useMemo(() => {
    return NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Dashboard"
  }, [pathname])

  return (
    <div className="relative min-h-screen">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-sidebar-border/70 bg-sidebar/70 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="border-b border-sidebar-border/70 px-6 py-6">
            <p className="font-heading text-2xl font-bold tracking-tight text-sidebar-foreground">
              ESG Console
            </p>
            <p className="mt-2 text-sm text-sidebar-foreground/80">
              Production-ready operating system for ESG reporting.
            </p>
          </div>
          <div className="px-4 py-5">
            <AppNav orientation="vertical" />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-3 px-4 py-3 md:px-6">
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button data-test="mobile-nav-open" variant="outline" size="icon-sm" className="lg:hidden">
                      <Menu className="size-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 border-r border-sidebar-border bg-sidebar p-0">
                    <SheetHeader className="border-b border-sidebar-border/70 px-5 py-5">
                      <SheetTitle className="font-heading text-xl font-semibold text-sidebar-foreground">
                        ESG Console
                      </SheetTitle>
                    </SheetHeader>
                    <div className="px-4 py-5">
                      <AppNav orientation="vertical" />
                    </div>
                  </SheetContent>
                </Sheet>
                <div>
                  <p className="font-heading text-lg font-semibold tracking-tight">ESG Console</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
                    <span>Workspace</span>
                    <ChevronRight className="size-3" />
                    <span>{crumb}</span>
                  </div>
                </div>
              </div>

              <div className="hidden min-w-[280px] flex-1 items-center justify-center px-6 md:flex">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Search"
                    placeholder="Search pages and controls..."
                    className="h-9 pl-9"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="page-enter mx-auto w-full max-w-[1560px] flex-1 px-4 py-4 md:px-6 md:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
