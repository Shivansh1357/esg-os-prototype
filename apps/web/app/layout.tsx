import Providers from './providers'
import './globals.css'

export const metadata = { title: 'ESG MVP' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{fontFamily:'Inter, system-ui, sans-serif', background:'#0b1020', color:'#eaeefb'}}>
        <div style={{maxWidth:1200, margin:'0 auto', padding:'24px'}}>
          <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
            <h1 style={{fontSize:20, fontWeight:600}}>ESG Console</h1>
            <nav style={{display:'flex', gap:16}}>
              <a href="/onboarding">Onboarding</a>
              <a href="/admin/users">Users</a>
              <a href="/admin/entities">Entities</a>
              <a href="/data">Data Hub</a>
              <a href="/emissions">Emissions</a>
              <a href="/compliance">Compliance</a>
              <a href="/reports">Reports</a>
              <a href="/suppliers">Suppliers</a>
              <a href="/exec">Exec</a>
            </nav>
          </header>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}


