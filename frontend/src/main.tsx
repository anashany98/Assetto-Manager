import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios, { AxiosHeaders } from 'axios'
import { toast } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { PUBLIC_API_TOKEN } from './config'
import { parseApiError } from './lib/apiError'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 5000,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    }
  }
})

// ---------------------------------------------------------------------------
// Axios request interceptor — attach auth / client token
// ---------------------------------------------------------------------------
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const headers = AxiosHeaders.from(config.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  } else if (PUBLIC_API_TOKEN) {
    // For public/kiosk screens, attach client token when configured.
    headers.set('X-Client-Token', PUBLIC_API_TOKEN)
  }

  config.headers = headers
  return config
})

// ---------------------------------------------------------------------------
// Axios response interceptor — global error handling
//   • 401 → redirect to login and clear stale token
//   • 5xx → show a toast so the user always gets feedback
//   • Other errors are re-thrown so individual components can handle them
// ---------------------------------------------------------------------------
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error?.response?.status

    if (status === 401) {
      const isLoginPage = window.location.pathname.includes('/login')
      if (!isLoginPage) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    } else if (status !== undefined && status >= 500) {
      toast.error(parseApiError(error, 'Error del servidor. Inténtalo de nuevo.'))
    } else if (status === 429) {
      toast.error('Demasiadas solicitudes. Por favor espera un momento.')
    }

    return Promise.reject(error)
  }
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <LanguageProvider>
              <App />
            </LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
