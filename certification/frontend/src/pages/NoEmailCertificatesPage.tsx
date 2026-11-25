import React, { useEffect, useState } from 'react'
import {
  FileDown,
  Download,
  Eye,
  Trash2,
  Search,
  RefreshCw,
  FolderArchive,
  CheckSquare,
  Square,
  AlertCircle,
  CheckCircle2,
  X,
  MailWarning,
  Layers,
} from 'lucide-react'
import {
  noEmailCertsApi,
  typesApi,
  NoEmailCertificate,
  AttestationType,
} from '../api/client'
import { NavTab } from '../components/Sidebar'

interface NoEmailCertificatesPageProps {
  onNavigate?: (tab: NavTab) => void
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const NoEmailCertificatesPage: React.FC<NoEmailCertificatesPageProps> = ({ onNavigate }) => {
  const [certs, setCerts] = useState<NoEmailCertificate[]>([])
  const [types, setTypes] = useState<AttestationType[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const [search, setSearch] = useState('')
  const [filterTypeId, setFilterTypeId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [previewCert, setPreviewCert] = useState<NoEmailCertificate | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (typeIdVal?: string, searchVal?: string) => {
    try {
      setLoading(true)
      setError(null)
      const activeType = typeIdVal !== undefined ? typeIdVal : filterTypeId
      const activeSearch = searchVal !== undefined ? searchVal : search

      const [certList, typeList] = await Promise.all([
        noEmailCertsApi.list({
          type_id: activeType ? Number(activeType) : undefined,
          search: activeSearch || undefined,
        }),
        typesApi.list().catch(() => []),
      ])

      setCerts(certList)
      setTypes(typeList)
      setSelectedIds((prev) => prev.filter((id) => certList.some((c) => c.id === id)))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load no-email certifications.')
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (val: string) => {
    setSearch(val)
    loadData(filterTypeId, val)
  }

  const handleTypeFilterChange = (val: string) => {
    setFilterTypeId(val)
    loadData(val, search)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === certs.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(certs.map((c) => c.id))
    }
  }

  const toggleRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleDelete = async (cert: NoEmailCertificate) => {
    if (!window.confirm(`Delete certificate for "${cert.recipient_name}"?`)) return
    try {
      await noEmailCertsApi.delete(cert.id)
      setSuccess(`Deleted certificate for ${cert.recipient_name}.`)
      setTimeout(() => setSuccess(null), 3000)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete certificate.')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} selected certificate(s)?`)) return
    try {
      await noEmailCertsApi.bulkDelete(selectedIds)
      setSuccess(`Deleted ${selectedIds.length} certificate(s).`)
      setTimeout(() => setSuccess(null), 3000)
      setSelectedIds([])
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete selected certificates.')
    }
  }

  const totalSize = certs.reduce((acc, c) => acc + (c.file_size_bytes || 0), 0)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2.5">
            <MailWarning className="h-6 w-6 text-amber-500" />
            <span>No Email Address Certification</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Certificates generated for participants with missing or invalid email addresses. Stored permanently in the database for individual or bulk download.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 shadow-xs self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
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

      {/* Summary & Mass Download Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Stored Certificates</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{certs.length}</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
            <FileDown className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Archive Size</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatBytes(totalSize)}</p>
          </div>
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-lg">
            <FolderArchive className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-center space-y-2">
          <a
            href={noEmailCertsApi.downloadZipUrl(undefined, false)}
            className={`w-full inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              certs.length > 0
                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-400 pointer-events-none'
            }`}
          >
            <FolderArchive className="h-4 w-4" />
            <span>Download All No-Email (ZIP)</span>
          </a>

          <a
            href={noEmailCertsApi.downloadZipUrl(undefined, true)}
            className="w-full inline-flex items-center justify-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
            title="Download all no-email certificates together with all sent certificates in one ZIP archive"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Download Mass ZIP (With All Certifications)</span>
          </a>
        </div>
      </div>

      {/* Filters & Selection Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search participant, title, Excel file..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={filterTypeId}
            onChange={(e) => handleTypeFilterChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All Certificate Types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center space-x-2">
            <a
              href={noEmailCertsApi.downloadZipUrl(selectedIds, false)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Selected ({selectedIds.length}) ZIP</span>
            </a>
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {certs.length === 0 && !loading ? (
          <div className="p-12 text-center text-slate-400">
            <MailWarning className="h-12 w-12 mx-auto mb-3 opacity-30 text-amber-500" />
            <p className="text-base font-semibold text-slate-700">
              No certificates in "No Email Address Certification" yet
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Whenever you import an Excel file with participants who have a missing or invalid email address, their PDF certificates are automatically generated and stored here.
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('excel-import')}
                className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Go to Excel Import
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-600 hover:text-sky-600">
                      {selectedIds.length === certs.length && certs.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-sky-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Participant</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Presentation Title</th>
                  <th className="py-3 px-4">Email Status</th>
                  <th className="py-3 px-4">Source Excel</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certs.map((cert) => {
                  const isSelected = selectedIds.includes(cert.id)
                  return (
                    <tr
                      key={cert.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(cert.id)}
                          className="rounded text-sky-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{cert.recipient_name}</p>
                        {cert.role_description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {cert.role_description}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                          {cert.type_name || 'Certificate'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[220px] truncate" title={cert.presentation_title}>
                        {cert.presentation_title || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          {cert.email_issue || 'Missing email'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        <p className="truncate max-w-[150px]" title={cert.source_excel_name}>
                          {cert.source_excel_name || '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {cert.sheet_name ? `Sheet: ${cert.sheet_name}` : ''} • Row {cert.row_index}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {formatBytes(cert.file_size_bytes)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1.5">
                          <button
                            onClick={() => setPreviewCert(cert)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="Preview Certificate"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <a
                            href={noEmailCertsApi.downloadUrl(cert.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>PDF</span>
                          </a>
                          <button
                            onClick={() => handleDelete(cert)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewCert && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewCert(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {previewCert.recipient_name} — {previewCert.type_name}
                </h3>
                <p className="text-xs text-slate-500">{previewCert.pdf_filename}</p>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={noEmailCertsApi.downloadUrl(previewCert.id)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF</span>
                </a>
                <button
                  onClick={() => setPreviewCert(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto bg-slate-100 flex-1 flex items-center justify-center">
              <img
                src={noEmailCertsApi.previewUrl(previewCert.id, true)}
                alt={previewCert.recipient_name}
                className="max-w-full max-h-[72vh] rounded-lg shadow-lg border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
