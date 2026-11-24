import React, { useEffect, useState } from 'react'
import {
  Award,
  FileCheck,
  Layers,
  FileSpreadsheet,
  Send,
  MailCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { templatesApi, typesApi, sendApi, settingsApi, SendJob } from '../api/client'
import { NavTab } from '../components/Sidebar'

interface DashboardProps {
  onNavigate: (tab: NavTab) => void
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    templatesCount: 0,
    typesCount: 0,
    jobsCount: 0,
    emailConfigured: false,
    emailSender: '',
    emailAuthType: '',
  })
  const [recentJobs, setRecentJobs] = useState<SendJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [tpls, types, jobs, emailSettings] = await Promise.all([
        templatesApi.list().catch(() => []),
        typesApi.list().catch(() => []),
        sendApi.listJobs().catch(() => []),
        settingsApi.getGmail().catch(() => ({ configured: false })),
      ])

      setStats({
        templatesCount: tpls.length,
        typesCount: types.length,
        jobsCount: jobs.length,
        emailConfigured: emailSettings.configured,
        emailSender: emailSettings.sender_email || '',
        emailAuthType: emailSettings.auth_type || 'none',
      })
      setRecentJobs(jobs.slice(0, 5))
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    {
      step: 1,
      title: 'PDF Template',
      desc: 'Upload or verify the congress certificate template PDF.',
      tab: 'templates' as NavTab,
      status: stats.templatesCount > 0 ? 'completed' : 'pending',
    },
    {
      step: 2,
      title: 'Attestation Types',
      desc: 'Define roles (Oral, Poster, Attendee) and email templates.',
      tab: 'types' as NavTab,
      status: stats.typesCount > 0 ? 'completed' : 'pending',
    },
    {
      step: 3,
      title: 'Visual Field Mapping',
      desc: 'Visually position participant name, role, and presentation title.',
      tab: 'field-editor' as NavTab,
      status: stats.typesCount > 0 ? 'completed' : 'pending',
    },
    {
      step: 4,
      title: 'Import Excel Sheets',
      desc: 'Upload participant Excel file and match sheets/columns.',
      tab: 'excel-import' as NavTab,
      status: 'pending',
    },
    {
      step: 5,
      title: 'Preview & Send',
      desc: 'Preview generated certificates and bulk-send via Gmail with live SSE tracking.',
      tab: 'recipients-send' as NavTab,
      status: 'pending',
    },
  ]

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Banner */}
      <div className="bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 rounded-2xl p-8 text-white shadow-xl border border-sky-800/40 relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-sky-500/20 text-sky-300 rounded-full text-xs font-semibold mb-3 border border-sky-400/30">
            <Award className="h-3.5 w-3.5" />
            <span>5th National Tunisian Thoracic Surgery Congress (TTSA)</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Attestation Generator & Dispatcher</h1>
          <p className="mt-2 text-slate-300 max-w-2xl text-sm leading-relaxed">
            Generate pixel-perfect personalized PDF certificates from Excel sheets and dispatch them via Gmail with real-time delivery monitoring.
          </p>
        </div>
        <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none">
          <Award className="w-80 h-80 text-white" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">PDF Templates</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.templatesCount}</p>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <FileCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Attestation Types</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.typesCount}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Send Jobs</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.jobsCount}</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Send className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Gmail Status</p>
            <p className="text-sm font-semibold mt-1 flex items-center gap-1.5">
              {stats.emailConfigured ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Ready ({stats.emailAuthType.toUpperCase()})
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Not Configured
                </span>
              )}
            </p>
            {stats.emailSender && (
              <p className="text-xs text-slate-400 truncate max-w-[140px] mt-0.5">{stats.emailSender}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${stats.emailConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <MailCheck className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Guided Workflow */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
          <span>Workflow Quick-Start</span>
          <span className="text-xs font-normal text-slate-500">Step-by-step guidance</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {steps.map((st) => (
            <button
              key={st.step}
              onClick={() => onNavigate(st.tab)}
              className="p-4 rounded-xl border border-slate-200 text-left hover:border-sky-500 hover:shadow-md transition-all flex flex-col justify-between group bg-slate-50/50 hover:bg-white"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full">
                    Step {st.step}
                  </span>
                  {st.status === 'completed' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <h3 className="font-semibold text-slate-800 text-sm group-hover:text-sky-600 transition-colors">
                  {st.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{st.desc}</p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-sky-600 group-hover:translate-x-0.5 transition-transform">
                <span>Go to step</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Recent Dispatch Batches</h2>
            <button
              onClick={() => onNavigate('recipients-send')}
              className="text-xs font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Job ID</th>
                  <th className="py-2.5 px-3">Recipients</th>
                  <th className="py-2.5 px-3">Sent / Failed</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3 font-medium text-slate-800">Job #{j.id}</td>
                    <td className="py-3 px-3 text-slate-600">{j.total_rows} participants</td>
                    <td className="py-3 px-3 text-slate-600">
                      <span className="text-emerald-600 font-medium">{j.sent_count}</span>
                      {' / '}
                      <span className="text-rose-600 font-medium">{j.failed_count}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          j.status === 'done'
                            ? 'bg-emerald-100 text-emerald-800'
                            : j.status === 'running'
                            ? 'bg-sky-100 text-sky-800 animate-pulse'
                            : j.status === 'partial'
                            ? 'bg-amber-100 text-amber-800'
                            : j.status === 'error'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {j.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onNavigate('recipients-send')}
                        className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                      >
                        Manage →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

