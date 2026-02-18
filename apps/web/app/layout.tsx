import Providers from './providers'
import AppNav from '@/components/AppNav'
import FeedbackPrompt from '@/components/FeedbackPrompt'
import './globals.css'

export const metadata = { title: 'ESG MVP' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{fontFamily:'Inter, system-ui, sans-serif', background:'#0b1020', color:'#eaeefb'}}>
        <Providers>
          <div style={{maxWidth:1200, margin:'0 auto', padding:'24px'}}>
            <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
              <h1 style={{fontSize:20, fontWeight:600}}>ESG Console</h1>
              <AppNav />
            </header>
            {children}
          </div>
          <FeedbackPrompt />
        </Providers>
      </body>
    </html>
  )
}


