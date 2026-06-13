// Routes that must skip JWT auth and tenant setup. Matched against the request
// PATH ONLY (query string stripped) using exact or prefix rules — never a loose
// substring scan — so a crafted query like `/reports?x=/auth/login` cannot trick
// a protected route into being treated as public.
export function isPublicPath(req: { path?: string; url?: string; originalUrl?: string }): boolean {
  // originalUrl is the full request path as received (not rewritten by internal
  // routing/mounting), unlike req.path which can resolve to "/" in middleware.
  const raw = String(req.originalUrl || req.url || req.path || '');
  const path = raw.split('?')[0];
  // Exact public endpoints
  if (path === '/health' || path === '/metrics' || path === '/auth/login') return true;
  // Token-scoped public flows (supplier portal + auditor/public read access)
  if (path.startsWith('/s/') || path.startsWith('/public/')) return true;
  return false;
}
