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
  Star,
  Check,
  ArrowRight,
} from 'lucide-react'
import { templatesApi, typesApi, PdfTemplate, AttestationType } from '../api/client'
import { NavTab } from '../components/Sidebar'

const STORAGE_KEY = 'ttsa_selected_template_id'

interface TemplatesPageProps {
  onNavigate?: (tab: NavTab, typeId?: number) => void
}

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onNavigate }) => {
  const [templates, setTemplates] = useState<PdfTemplate[]>([])
  const [types, setTypes] = useState<AttestationType[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<PdfTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [settingActive, setSettingActive] = useState(false)
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
      const [tplList, typeList] = await Promise.all([
        templatesApi.list(),
        typesApi.list().catch(() => []),
      ])

      setTemplates(tplList)
      setTypes(typeList)

      // Restore selected template from localStorage or find active type template
      const savedId = localStorage.getItem(STORAGE_KEY)
      let matched = tplList.find((t) => String(t.id) === savedId)

      // If no valid saved id, check if default type (Conference) has an assigned template
      if (!matched && typeList.length > 0 && typeList[0].template_id) {
        matched = tplList.find((t) => t.id === typeList[0].template_id)
      }

      // If still not matched, use the latest template (last uploaded) or first
      if (!matched && tplList.length > 0) {
        matched = tplList[tplList.length - 1]
      }

      if (matched) {
        setSelectedTemplate(matched)
        localStorage.setItem(STORAGE_KEY, String(matched.id))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectTemplate = (tpl: PdfTemplate) => {
    setSelectedTemplate(tpl)
    localStorage.setItem(STORAGE_KEY, String(tpl.id))
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
      const cleanName = templateName.trim() || file.name.replace(/\.[^/.]+$/, '')
      const newTpl = await templatesApi.upload(file, cleanName)

      // Automatically link newly uploaded template to Type #0 (Conference)
      const typeList = await typesApi.list().catch(() => [])
      const defaultType = typeList[0]
      if (defaultType) {
        await typesApi.update(defaultType.id, { template_id: newTpl.id })
      }

      localStorage.setItem(STORAGE_KEY, String(newTpl.id))
      setTemplateName('')
      setSuccess(
        `Template "${newTpl.name}" uploaded successfully and set as active for ${
          defaultType?.name || 'Conference'
        }!`
      )

      await loadTemplates()
      setSelectedTemplate(newTpl)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload template.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSetActiveForType = async (typeId: number, tplId: number) => {
    try {
      setSettingActive(true)
      setError(null)
      const targetType = types.find((t) => t.id === typeId)
      await typesApi.update(typeId, { template_id: tplId })
      setSuccess(`Template set as active for "${targetType?.name || 'Type'}"!`)
      await loadTemplates()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to set active template.')
    } finally {
      setSettingActive(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return
    try {
      await templatesApi.delete(id)
      setSuccess('Template deleted.')
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null)
        localStorage.removeItem(STORAGE_KEY)
      }
      await loadTemplates()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete template.')
    }
  }

  // Find which types currently use this template
  const getTypesUsingTemplate = (tplId: number) => {
    return types.filter((t) => t.template_id === tplId)
  }

  const defaultType = types[0]

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
                placeholder="e.g. Certification general model TTSA 2026"
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
                Uploading and saving PDF template...
              </p>
            )}
          </div>

          {/* Templates List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Saved Templates ({templates.length})
              </h2>
            </div>
            {templates.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No templates uploaded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {templates.map((tpl) => {
                  const isSelected = selectedTemplate?.id === tpl.id
                  const usedByTypes = getTypesUsingTemplate(tpl.id)
                  const isUsedByDefaultType = defaultType && defaultType.template_id === tpl.id

                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl)}
                      className={`p-3.5 flex flex-col space-y-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/80 border-l-4 border-sky-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
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

                      {/* Badges & Quick Action */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isUsedByDefaultType ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <Star className="h-2.5 w-2.5 fill-emerald-600 text-emerald-600" />
                              <span>Active (Conference)</span>
                            </span>
                          ) : usedByTypes.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800">
                              Active: {usedByTypes.map((t) => t.name).join(', ')}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Available</span>
                          )}
                        </div>

                        {defaultType && !isUsedByDefaultType && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetActiveForType(defaultType.id, tpl.id)
                            }}
                            disabled={settingActive}
                            className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 hover:underline inline-flex items-center space-x-1"
                          >
                            <Check className="h-3 w-3" />
                            <span>Set for Conference</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Template Preview & Actions */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[520px]">
            {/* Preview Toolbar */}
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-800 truncate max-w-xs">
                  {selectedTemplate ? selectedTemplate.name : 'Template Live Preview'}
                </span>
                {selectedTemplate && defaultType?.template_id === selectedTemplate.id && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <Star className="h-2.5 w-2.5 fill-emerald-600 text-emerald-600" />
                    <span>Active Template</span>
                  </span>
                )}
              </div>

              {selectedTemplate && (
                <div className="flex items-center space-x-3 text-xs">
                  {/* Set as active button */}
                  {defaultType && defaultType.template_id !== selectedTemplate.id && (
                    <button
                      onClick={() => handleSetActiveForType(defaultType.id, selectedTemplate.id)}
                      disabled={settingActive}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold transition-colors"
                    >
                      <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                      <span>Use for Conference</span>
                    </button>
                  )}

                  {/* Navigate to field editor */}
                  {onNavigate && defaultType && (
                    <button
                      onClick={() => onNavigate('field-editor', defaultType.id)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg font-semibold transition-colors"
                    >
                      <span>Position Fields</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Zoom controls */}
                  <div className="flex items-center space-x-1">
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
                </div>
              )}
            </div>

            {/* Canvas / Image Display */}
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
