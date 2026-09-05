import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveProvider } from '@/api/live'
import App from './App'
import './index.css'

/**
 * Cache policy: data is considered fresh for 30 seconds, and a 60-second
 * background refetch acts as a safety net if the socket ever drops. The socket
 * is what makes the UI feel instant; polling is only the fallback.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LiveProvider>
    </QueryClientProvider>
  </StrictMode>,
)
