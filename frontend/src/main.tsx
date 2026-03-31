import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { installAuthInterceptors } from './auth/http'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
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

installAuthInterceptors(axios)

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error?.response?.status

    if (status === 401) {
      return Promise.reject(error)
    }
    if (status !== undefined && status >= 500) {
      toast.error(parseApiError(error, 'Error del servidor. Intentalo de nuevo.'))
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
