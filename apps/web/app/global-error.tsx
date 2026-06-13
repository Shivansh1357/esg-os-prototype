'use client'

// global-error replaces the root layout when an error is thrown during its
// render, so it must provide its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>The console failed to load</h2>
        <p style={{ maxWidth: '28rem', color: '#64748b', fontSize: '0.875rem' }}>
          A critical error occurred while loading the application. Please reload the page.
        </p>
        {error.digest ? (
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
            ref: {error.digest}
          </p>
        ) : null}
        <button
          onClick={() => reset()}
          style={{
            borderRadius: '0.375rem',
            background: '#0f172a',
            color: '#fff',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </body>
    </html>
  )
}
