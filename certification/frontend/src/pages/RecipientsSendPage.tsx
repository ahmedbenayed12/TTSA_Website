import React, { useEffect, useState, useRef } from 'react'
import {
  Send,
  RefreshCw,
  RotateCcw,
  StopCircle,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  Search,
  Filter,
  FileArchive,
} from 'lucide-react'
import {
  sendApi,
  SendJob,
  SendLog,
  getAuthToken,
  API_BASE,
} from '../api/client'

interface RecipientsSendPageProps {
  initialJobId?: number
}

export const RecipientsSendPage: React.FC<RecipientsSendPageProps> = ({ initialJobId }) => {
  const [jobs, setJobs] = useState<SendJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId || null)
  const [currentJob, setCurrentJob] = useState<SendJob | null>(null)
  const [logs, setLogs] = useState<SendLog[]>([])
  
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  
  // Real-time progress state
  const [progress, setProgress] = useState<{
    total: number
    sent: number
    failed: number
    status: string
    current_row?: number
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Preview modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewTargetName, setPreviewTargetName] = useState<string>('')
  const [loadingPreview, setLoadingPreview] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    loadJobs()
    return () => {
      closeEventSource()
    }
  }, [])

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetails(selectedJobId)
    }
  }, [selectedJobId, statusFilter])

  const closeEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }

  const loadJobs = async () => {
    try {
      setLoading(true)
      const list = await sendApi.listJobs()
      setJobs(list)
      if (list.length > 0) {
        const targetId = initialJobId && list.some((j) => j.id === initialJobId) ? initialJobId : list[0].id
        setSelectedJobId(targetId)
      }
    } catch (err: any) {
      setError('Failed to load send jobs.')
    } finally {
      setLoading(false)
    }
  }

  const loadJobDetails = async (jobId: number) => {
    try {
      const [jobData, logList] = await Promise.all([
        sendApi.getJob(jobId),
        sendApi.getLogs(jobId, statusFilter || undefined),
      ])
      setCurrentJob(jobData)
      setLogs(logList)

      // Sync progress state
      setProgress({
        total: jobData.total_rows,
        sent: jobData.sent_count,
        failed: jobData.failed_count,
        status: jobData.status,
      })

      // If job is running, start SSE listener
      if (jobData.status === 'running') {
        startProgressStream(jobId)
      }
    } catch (err: any) {
      setError('Failed to load recipient logs for this job.')
    }
  }

  const startProgressStream = (jobId: number) => {
    closeEventSource()

    const token = getAuthToken()
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    const sse = new EventSource(`${API_BASE}/send/progress/${jobId}${tokenParam}`)
    eventSourceRef.current = sse

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.status !== 'unknown') {
          setProgress({
            total: data.total,
            sent: data.sent,
            failed: data.failed,
            status: data.status,
            current_row: data.current_row,
          })

          if (data.status === 'done' || data.status === 'partial' || data.status === 'error') {
            closeEventSource()
            loadJobDetails(jobId)
          }
        }
      } catch (err) {
        console.error('Error parsing SSE:', err)
      }
    }

    sse.onerror = () => {
      closeEventSource()
    }
  }

  const handleStartSend = async () => {
    if (!selectedJobId) return
    if (!window.confirm('Are you ready to send emails to all eligible recipients?')) return

    try {
      setActionLoading(true)
      setError(null)
      await sendApi.start(selectedJobId)
      setSuccess('Send job dispatched!')
      startProgressStream(selectedJobId)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start send job.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRetryFailed = async () => {
    if (!selectedJobId) return
    try {
      setActionLoading(true)
      setError(null)
      await sendApi.retry(selectedJobId)
      setSuccess('Retry job initiated!')
      startProgressStream(selectedJobId)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to retry failed rows.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!selectedJobId) return
    try {
      await sendApi.cancel(selectedJobId)
      setSuccess('Job cancellation requested.')
      closeEventSource()
      await loadJobDetails(selectedJobId)
    } catch (err: any) {
      setError('Failed to cancel job.')
    }
  }

  const openPreview = async (log: SendLog) => {
    try {
      setLoadingPreview(true)
      setPreviewTargetName(log.recipient_name)
      setPreviewModalOpen(true)

      const blob = await sendApi.previewRowBlob({ log_id: log.id }, false)
      const url = URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    } catch (err) {
      setError('Failed to render certificate preview.')
      setPreviewModalOpen(false)
    } finally {
      setLoadingPreview(false)
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      log.recipient_name.toLowerCase().includes(q) ||
      log.recipient_email.toLowerCase().includes(q)
    )
  })

  const percentComplete = progress && progress.total > 0
    ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
    : 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Send & Real-Time Progress</h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch personalized certificates via Gmail, preview individual PDFs, and track delivery progress live.
          </p>
        </div>

        {/* Batch Job Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-500">Batch Job:</span>
          <select
            value={selectedJobId || ''}
            onChange={(e) => setSelectedJobId(Number(e.target.value))}
            className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white shadow-xs focus:ring-2 focus:ring-sky-500"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                Job #{j.id} ({j.total_rows} recipients) — {j.status.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedJobId && loadJobDetails(selectedJobId)}
            className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600"
            title="Refresh logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center space-x-2 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center space-x-2 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Control & Progress Card */}
      {currentJob && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-bold text-slate-900">Job #{currentJob.id} Status:</span>
                <span
                  className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    currentJob.status === 'done'
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentJob.status === 'running'
                      ? 'bg-sky-100 text-sky-800 animate-pulse'
                      : currentJob.status === 'error'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {currentJob.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Source: {currentJob.excel_path} • Total Recipients: {currentJob.total_rows}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleStartSend}
                disabled={actionLoading || currentJob.status === 'running'}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send All ({currentJob.total_rows})</span>
              </button>

              {currentJob.failed_count > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={actionLoading || currentJob.status === 'running'}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retry Failed ({currentJob.failed_count})</span>
                </button>
              )}

              {currentJob.status === 'running' && (
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  <span>Cancel Job</span>
                </button>
              )}

              <a
                href={sendApi.downloadZipUrl(currentJob.id)}
                download
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                <FileArchive className="h-3.5 w-3.5" />
                <span>Download All (ZIP)</span>
              </a>

              <a
                href={sendApi.exportCsvUrl(currentJob.id)}
                download
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </a>
            </div>
          </div>

          {/* Real-time Progress Bar */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-600">
                Progress: {percentComplete}% ({progress?.sent || 0} sent, {progress?.failed || 0} failed)
              </span>
              <span className="text-slate-400">
                {(progress?.sent || 0) + (progress?.failed || 0)} / {progress?.total || 0} processed
              </span>
            </div>

            <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden flex">
              <div
                style={{
                  width: `${progress?.total ? (progress.sent / progress.total) * 100 : 0}%`,
                }}
                className="bg-emerald-500 h-full transition-all duration-300"
              />
              <div
                style={{
                  width: `${progress?.total ? (progress.failed / progress.total) * 100 : 0}%`,
                }}
                className="bg-rose-500 h-full transition-all duration-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* Recipients Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Filters Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by participant name or email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <div className="flex bg-slate-200/70 p-0.5 rounded-lg text-xs">
              {(['', 'sent', 'failed', 'pending', 'no_email'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md font-semibold capitalize transition-all ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'no_email' ? 'No Email' : st || 'All'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 w-12">Row</th>
                <th className="py-2.5 px-3">Participant Name</th>
                <th className="py-2.5 px-3">Recipient Email</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Details / Timestamp</th>
                <th className="py-2.5 px-3 text-right">Certificate Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No recipients matching filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-mono text-slate-400">{log.row_index}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{log.recipient_name}</td>
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {log.recipient_email}
                    </td>
                    <td className="py-3 px-3">
                      {log.status === 'sent' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>SENT</span>
                        </span>
                      )}
                      {log.status === 'failed' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                          <XCircle className="h-3 w-3" />
                          <span>FAILED</span>
                        </span>
                      )}
                      {log.status === 'pending' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                          <Clock className="h-3 w-3" />
                          <span>PENDING</span>
                        </span>
                      )}
                      {log.status === 'no_email' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                          <span>NO EMAIL (PDF SAVED)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {log.error_message ? (
                        <span
                          className={`${log.status === 'no_email' ? 'text-amber-700' : 'text-rose-600'} truncate block max-w-xs`}
                          title={log.error_message}
                        >
                          {log.error_message}
                        </span>
                      ) : log.sent_at ? (
                        <span>{new Date(log.sent_at).toLocaleTimeString()}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => openPreview(log)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded text-[11px] font-semibold transition-colors"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Preview PDF</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Certificate Preview: {previewTargetName}
                </h3>
                <p className="text-xs text-slate-400">
                  Generated on-the-fly using official template & live participant coordinates.
                </p>
              </div>
              <button
                onClick={() => {
                  setPreviewModalOpen(false)
                  setPreviewBlobUrl(null)
                }}
                className="text-xs font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto my-4 bg-slate-100 rounded-xl p-4 flex items-center justify-center min-h-[400px]">
              {loadingPreview ? (
                <div className="text-center text-slate-500 text-sm">Rendering PDF certificate...</div>
              ) : previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  title="PDF Certificate Preview"
                  className="w-full h-[540px] rounded-lg shadow-lg border border-slate-300"
                />
              ) : (
                <div className="text-slate-400">No preview generated.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

