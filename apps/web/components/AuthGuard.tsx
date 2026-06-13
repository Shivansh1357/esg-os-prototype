"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { isAuthenticated } from "@/lib/session"

/**
 * Client-side auth guard. After mount, redirects to /login only when the user
 * is not authenticated and the current route is neither /login nor the public
 * supplier portal (/s/...). Because E2E/dev bake NEXT_PUBLIC_TENANT_ID,
 * isAuthenticated() returns true there and no redirect occurs.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const isPublic = pathname === "/login" || pathname.startsWith("/s/")
    if (!isPublic && !isAuthenticated()) {
      router.replace("/login")
    }
  }, [pathname, router])

  return <>{children}</>
}
