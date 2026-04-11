import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AdminGuard } from '@/components/AdminGuard'

export const metadata: Metadata = {
  title: 'Monitoramento de Entregas | Linea',
  description: 'Portal de monitoramento de entregas em tempo real',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ThemeProvider>
          <AdminGuard>{children}</AdminGuard>
        </ThemeProvider>
      </body>
    </html>
  )
}
