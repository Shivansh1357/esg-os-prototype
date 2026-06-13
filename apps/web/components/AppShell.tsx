"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, LogOut, Menu, Search } from "lucide-react"
import AppNav, { NAV_ITEMS } from "@/components/AppNav"
import ThemeToggle from "@/components/theme-toggle"
import { AiStatusIndicator } from "@/components/product"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { clearSession, hasStoredSession } from "@/lib/session"
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

  const router = useRouter()
  // localStorage is only available after mount; gating on this avoids a
  // hydration mismatch and keeps the env-only (E2E/dev) header visually unchanged.
  const [showLogout, setShowLogout] = useState(false)
  useEffect(() => {
    setShowLogout(hasStoredSession())
  }, [pathname])

  function handleLogout() {
    clearSession()
    setShowLogout(false)
    router.push("/login")
  }

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
                <GlobalSearch />
              </div>

              <div className="flex items-center gap-3">
                <AiStatusIndicator />
                <ThemeToggle />
                {showLogout ? (
                  <Button
                    data-test="logout-btn"
                    variant="outline"
                    size="icon-sm"
                    onClick={handleLogout}
                    title="Log out"
                  >
                    <LogOut className="size-4" />
                    <span className="sr-only">Log out</span>
                  </Button>
                ) : null}
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

function GlobalSearch() {
  const router = useRouter()
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return [] as typeof NAV_ITEMS
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(term) || item.href.toLowerCase().includes(term)
    )
  }, [query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  function go(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (!results.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((prev) => (prev + 1) % results.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const target = results[activeIndex] ?? results[0]
      if (target) go(target.href)
    }
  }

  const showResults = open && results.length > 0
  const activeOptionId = showResults ? `${listboxId}-option-${activeIndex}` : undefined

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
      <Input
        data-test="global-search"
        aria-label="Search pages and controls"
        placeholder="Search pages and controls..."
        className="h-9 pl-9"
        role="combobox"
        aria-expanded={showResults}
        aria-controls={showResults ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {showResults ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border/70 bg-popover p-1 shadow-md"
        >
          {results.map((item, index) => (
            <li
              key={item.href}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm",
                  index === activeIndex
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(item.href)}
              >
                <span>{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.href}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
