import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios, { AxiosHeaders } from 'axios'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { PUBLIC_API_TOKEN } from './config'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'
import './styles/v2-design-system.css'

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
