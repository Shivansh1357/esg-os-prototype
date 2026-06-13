"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { ReportContextProvider } from "./report-context"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import AuthGuard from "@/components/AuthGuard"

export default function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient())
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <TooltipProvider delayDuration={120}>
          <ReportContextProvider>
            <AuthGuard>{children}</AuthGuard>
            <Toaster />
          </ReportContextProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

