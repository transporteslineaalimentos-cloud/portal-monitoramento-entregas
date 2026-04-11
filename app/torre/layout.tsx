// Torre de Controle tem login próprio — não precisa do AdminGuard do portal interno
export default function TorreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
