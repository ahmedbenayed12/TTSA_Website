import React, { useEffect, useState } from 'react'
import {
  Upload,
  FileCheck,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { templatesApi, PdfTemplate } from '../api/client'

export const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<PdfTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<PdfTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [previewZoom, setPreviewZoom] = useState(2.0)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const list = await templatesApi.list()
      setTemplates(list)
      if (list.length > 0 && !selectedTemplate) {
        setSelectedTemplate(list[0])
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }

    try {
      setUploading(true)
      setError(null)
      const newTpl = await templatesApi.upload(file, templateName)
      setSuccess(`Template "${newTpl.name}" uploaded successfully!`)
      setTemplateName('')
      await loadTemplates()
      setSelectedTemplate(newTpl)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload template.')
    } finally {
      setUploading(false)
      // reset file input
      e.target.value = ''
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return
    try {
      await templatesApi.delete(id)
      setSuccess('Template deleted.')
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null)
      }
      await loadTemplates()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete template.')
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PDF Certificate Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload the official congress certificate PDF base. Dynamic text (name, role, title) is stamped over this PDF.
          </p>
        </div>
        <button
          onClick={loadTemplates}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="h-4 w-4" />
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
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload & List */}
        <div className="space-y-6">
          {/* Upload Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Upload New Template</h2>
            
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Template Name (optional)
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. TTSA 2026 Official Template"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <label className="block w-full border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 rounded-xl p-6 text-center cursor-pointer transition-colors">
              <Upload className="h-8 w-8 text-sky-600 mx-auto mb-2" />
              <span className="text-sm font-semibold text-sky-700 block">Click to upload PDF</span>
              <span className="text-xs text-slate-500 mt-1 block">A4 Landscape recommended (842 × 595 pt)</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={handleFileUpload}
              />
            </label>
            {uploading && (
              <p className="text-xs text-center text-sky-600 font-medium animate-pulse">
                Uploading and inspecting PDF...
              </p>
            )}
          </div>

          {/* Templates List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Saved Templates ({templates.length})
              </h2>
            </div>
            {templates.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No templates uploaded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {templates.map((tpl) => {
                  const isSelected = selectedTemplate?.id === tpl.id
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/80 border-l-4 border-sky-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <FileText className={`h-5 w-5 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                        <div className="truncate">
                          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                            {tpl.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {tpl.original_filename} • {tpl.page_count} page(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(tpl.id)
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white"
                          title="Delete template"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Template Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-800">
                  {selectedTemplate ? selectedTemplate.name : 'Template Live Preview'}
                </span>
              </div>
              {selectedTemplate && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500">Zoom:</span>
                  <select
                    value={previewZoom}
                    onChange={(e) => setPreviewZoom(Number(e.target.value))}
                    className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value={1.0}>100%</option>
                    <option value={1.5}>150%</option>
                    <option value={2.0}>200% (Hi-Res)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 bg-slate-100 flex items-center justify-center overflow-auto">
              {selectedTemplate ? (
                <div className="shadow-2xl rounded-lg overflow-hidden border border-slate-300 bg-white max-w-full">
                  <img
                    src={templatesApi.previewUrl(selectedTemplate.id, 0, previewZoom)}
                    alt={selectedTemplate.name}
                    className="max-h-[620px] object-contain w-auto mx-auto block"
                  />
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Select or upload a template to preview it here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

