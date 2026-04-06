import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Monitoramento de Entregas | Linea',
  description: 'Portal de monitoramento de entregas em tempo real',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
