import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react'
import { getAuthToken } from './api/client'
import { Sidebar, NavTab } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { TemplatesPage } from './pages/TemplatesPage'
import { AttestationTypesPage } from './pages/AttestationTypesPage'
import { FieldEditorPage } from './pages/FieldEditorPage'
import { ExcelImportPage } from './pages/ExcelImportPage'
import { RecipientsSendPage } from './pages/RecipientsSendPage'
import { NoEmailCertificatesPage } from './pages/NoEmailCertificatesPage'
import { SettingsPage } from './pages/SettingsPage'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Certification Manager uncaught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-sans">
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 max-w-lg w-full">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 mb-4">
              An error occurred while loading this section of the Certification Manager.
            </p>
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg text-left font-mono overflow-auto max-h-36 mb-6">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition"
              >
                Reload Page
              </button>
              <a
                href="/admin/dashboard.html"
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition inline-block"
              >
                Back to Admin Dashboard
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function parseJwt(token: string | null): any {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
      return JSON.parse(jsonPayload)
    }
  } catch (_) {}
  return null
}

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard')
  const [activeTypeId, setActiveTypeId] = useState<number | undefined>(undefined)
  const [activeJobId, setActiveJobId] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin/certification')) {
      const token = getAuthToken()
      const payload = parseJwt(token)
      const role = payload?.role || localStorage.getItem('ttsa_role')
      if (!token || (role && role !== 'admin')) {
        window.location.href = '/login.html'
      }
    }
  }, [])

  const handleNavigate = (tab: NavTab, id?: number) => {
    if (tab === 'field-editor' && id) {
      setActiveTypeId(id)
    } else if (tab === 'recipients-send' && id) {
      setActiveJobId(id)
    }
    setCurrentTab(tab)
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
        {/* Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab)
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Top Header */}
          <header className="h-14 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-8 flex items-center justify-between shrink-0 shadow-2xs z-20">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400 font-medium">Attestation System</span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-800 capitalize">
                {currentTab.replace('-', ' ')}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                Sfax, Nov 6–7, 2026
              </span>
            </div>
          </header>

          {/* Scrollable Page Body */}
          <div className="flex-1 overflow-y-auto p-8">
            {currentTab === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
            {currentTab === 'templates' && <TemplatesPage onNavigate={handleNavigate} />}
            {currentTab === 'types' && <AttestationTypesPage onNavigate={handleNavigate} />}
            {currentTab === 'field-editor' && <FieldEditorPage initialTypeId={activeTypeId} />}
            {currentTab === 'excel-import' && <ExcelImportPage onNavigate={handleNavigate} />}
            {currentTab === 'recipients-send' && <RecipientsSendPage initialJobId={activeJobId} />}
            {currentTab === 'no-email-certs' && <NoEmailCertificatesPage onNavigate={handleNavigate} />}
            {currentTab === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}

export default App
