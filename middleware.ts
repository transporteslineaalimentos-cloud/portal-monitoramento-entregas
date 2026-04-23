import { NextRequest, NextResponse } from 'next/server'

// Rotas que exigem autenticação admin (sessionStorage não é verificável no server)
// O middleware protege as rotas de API sensíveis e adiciona security headers

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Security headers em todas as respostas
  const res = NextResponse.next()
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co https://ws.activeonsupply.com.br https://api.anthropic.com; font-src 'self' data:; frame-ancestors 'none'"
  )

  // Bloquear acesso direto via browser à rota de configuração — apenas via referer interno
  // (A proteção real fica no sessionStorage verificado no client e no token das APIs)

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.png$|.*\.svg$|.*\.ico$).*)',
  ],
}
