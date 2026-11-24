import React, { useState, useEffect } from 'react'
import { getAuthToken } from './api/client'
import { Sidebar, NavTab } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { TemplatesPage } from './pages/TemplatesPage'
import { AttestationTypesPage } from './pages/AttestationTypesPage'
import { FieldEditorPage } from './pages/FieldEditorPage'
import { ExcelImportPage } from './pages/ExcelImportPage'
import { RecipientsSendPage } from './pages/RecipientsSendPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard')
  const [activeTypeId, setActiveTypeId] = useState<number | undefined>(undefined)
  const [activeJobId, setActiveJobId] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin/certification')) {
      const token = getAuthToken()
      const role = localStorage.getItem('ttsa_role')
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
          {currentTab === 'templates' && <TemplatesPage />}
          {currentTab === 'types' && <AttestationTypesPage onNavigate={handleNavigate} />}
          {currentTab === 'field-editor' && <FieldEditorPage initialTypeId={activeTypeId} />}
          {currentTab === 'excel-import' && <ExcelImportPage onNavigate={handleNavigate} />}
          {currentTab === 'recipients-send' && <RecipientsSendPage initialJobId={activeJobId} />}
          {currentTab === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}

export default App
