import React from 'react'
import {
  LayoutDashboard,
  FileCheck,
  Layers,
  Move,
  FileSpreadsheet,
  Send,
  FileDown,
  Settings as SettingsIcon,
  Award,
} from 'lucide-react'

export type NavTab =
  | 'dashboard'
  | 'templates'
  | 'types'
  | 'field-editor'
  | 'excel-import'
  | 'recipients-send'
  | 'no-email-certs'
  | 'settings'

interface SidebarProps {
  currentTab: NavTab
  onSelectTab: (tab: NavTab) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'templates', label: 'PDF Template', icon: FileCheck },
    { id: 'types', label: 'Attestation Types', icon: Layers },
    { id: 'field-editor', label: 'Field Mapping Editor', icon: Move },
    { id: 'excel-import', label: 'Excel Import', icon: FileSpreadsheet },
    { id: 'recipients-send', label: 'Send & Progress', icon: Send },
    { id: 'no-email-certs', label: 'No Email Certifications', icon: FileDown },
    { id: 'settings', label: 'Gmail & Settings', icon: SettingsIcon },
  ] as const

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0 shadow-xl border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800/80 flex items-center space-x-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Award className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-base tracking-wide text-white leading-tight">TTSA Attestation</h1>
          <p className="text-xs text-sky-400 font-medium">5th Congress Sfax 2026</p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-medium">System Ready</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Tunisian Thoracic Surgery Assoc.</p>
      </div>
    </aside>
  )
}

