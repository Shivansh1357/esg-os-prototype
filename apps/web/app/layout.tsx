import Providers from './providers'
import AppShell from '@/components/AppShell'
import FeedbackPrompt from '@/components/FeedbackPrompt'
import { Manrope, Sora } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap'
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap'
})

export const metadata = { title: 'ESG Console' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sora.variable} font-sans`}>
        <Providers>
          <AppShell>{children}</AppShell>
          <FeedbackPrompt />
        </Providers>
      </body>
    </html>
  )
}

