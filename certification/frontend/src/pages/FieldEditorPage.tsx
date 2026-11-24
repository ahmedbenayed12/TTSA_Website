import React, { useEffect, useState, useRef } from 'react'
import {
  Move,
  Save,
  Plus,
  Trash2,
  Eye,
  CheckCircle,
  AlertCircle,
  Sliders,
  Upload,
  RefreshCw,
  FileText,
} from 'lucide-react'
import {
  typesApi,
  templatesApi,
  sendApi,
  AttestationType,
  FieldMapping,
  PdfTemplate,
} from '../api/client'

const STORAGE_KEY = 'ttsa_selected_template_id'

interface FieldEditorPageProps {
  initialTypeId?: number
}

// Recommended TTSA A4 landscape dimensions (in points)
const PDF_WIDTH = 841.89
const PDF_HEIGHT = 595.28

export const FieldEditorPage: React.FC<FieldEditorPageProps> = ({ initialTypeId }) => {
  const [types, setTypes] = useState<AttestationType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(initialTypeId || null)
  const [allTemplates, setAllTemplates] = useState<PdfTemplate[]>([])
  const [template, setTemplate] = useState<PdfTemplate | null>(null)
  const [fields, setFields] = useState<FieldMapping[]>([])
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number>(0)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadTypesAndTemplates()
  }, [])

  useEffect(() => {
    if (selectedTypeId) {
      loadTypeFields(selectedTypeId)
    }
  }, [selectedTypeId])

  const loadTypesAndTemplates = async () => {
    try {
      setLoading(true)
      const [typeList, tplList] = await Promise.all([
        typesApi.list(),
        templatesApi.list(),
      ])

      setTypes(typeList)
      setAllTemplates(tplList)

      if (typeList.length > 0) {
        const targetId = initialTypeId || typeList[0].id
        setSelectedTypeId(targetId)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load attestation types.')
    } finally {
      setLoading(false)
    }
  }

  const loadTypeFields = async (typeId: number) => {
    try {
      const [typeData, loadedFields, tplList] = await Promise.all([
        typesApi.get(typeId),
        typesApi.getFields(typeId),
        templatesApi.list(),
      ])

      setAllTemplates(tplList)
      setFields(loadedFields.length > 0 ? loadedFields : getDefaultFields())
      setSelectedFieldIndex(0)

      let activeTpl: PdfTemplate | null = null

      if (typeData.template_id) {
        activeTpl = tplList.find((t) => t.id === typeData.template_id) || null
      }

      // If no template assigned to type, check localStorage or fallback to latest
      if (!activeTpl) {
        const savedId = localStorage.getItem(STORAGE_KEY)
        activeTpl = tplList.find((t) => String(t.id) === savedId) || tplList[tplList.length - 1] || null

        if (activeTpl) {
          // Persist association to database
          await typesApi.update(typeId, { template_id: activeTpl.id }).catch(() => {})
        }
      }

      if (activeTpl) {
        setTemplate(activeTpl)
        localStorage.setItem(STORAGE_KEY, String(activeTpl.id))
      }
    } catch (err: any) {
      setError('Failed to load fields for selected type.')
    }
  }

  const handleTemplateChange = async (newTplId: number) => {
    const chosen = allTemplates.find((t) => t.id === newTplId)
    if (!chosen || !selectedTypeId) return

    setTemplate(chosen)
    localStorage.setItem(STORAGE_KEY, String(chosen.id))

    try {
      await typesApi.update(selectedTypeId, { template_id: chosen.id })
      setSuccess(`Active template changed to: ${chosen.name}`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update template for this type.')
    }
  }

  const handleDirectPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedTypeId) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }

    try {
      setUploadingPdf(true)
      setError(null)
      const cleanName = file.name.replace(/\.[^/.]+$/, '')
      const newTpl = await templatesApi.upload(file, cleanName)

      // Associate immediately with active type in database
      await typesApi.update(selectedTypeId, { template_id: newTpl.id })

      const updatedTplList = await templatesApi.list()
      setAllTemplates(updatedTplList)
      setTemplate(newTpl)
      localStorage.setItem(STORAGE_KEY, String(newTpl.id))

      setSuccess(`Template "${newTpl.name}" uploaded and set active for this type!`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload PDF template.')
    } finally {
      setUploadingPdf(false)
      e.target.value = ''
    }
  }

  const getDefaultFields = (): FieldMapping[] => [
    {
      field_name: 'participant_name',
      label: 'Participant Name',
      x: 421,
      y: 285,
      page: 0,
      font: 'Helvetica-Bold',
      font_size: 22,
      color: 0x1a2b4c,
      alignment: 'center',
      max_width: 450,
      is_bold: true,
      is_italic: false,
    },
    {
      field_name: 'role_description',
      label: 'Role Description',
      x: 421,
      y: 320,
      page: 0,
      font: 'Helvetica-Oblique',
      font_size: 14,
      color: 0x333333,
      alignment: 'center',
      max_width: 500,
      is_bold: false,
      is_italic: true,
    },
    {
      field_name: 'presentation_title',
      label: 'Presentation Title',
      x: 421,
      y: 348,
      page: 0,
      font: 'Helvetica-Oblique',
      font_size: 12,
      color: 0x444444,
      alignment: 'center',
      max_width: 520,
      is_bold: false,
      is_italic: true,
    },
  ]

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || fields.length === 0) return
    const rect = canvasRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Convert screen coordinates to PDF points
    const pdfX = Math.round((clickX / rect.width) * PDF_WIDTH)
    const pdfY = Math.round((clickY / rect.height) * PDF_HEIGHT)

    updateSelectedField({ x: pdfX, y: pdfY })
  }

  const updateSelectedField = (updates: Partial<FieldMapping>) => {
    setFields((prev) => {
      const next = [...prev]
      if (next[selectedFieldIndex]) {
        next[selectedFieldIndex] = { ...next[selectedFieldIndex], ...updates }
      }
      return next
    })
  }

  const addField = () => {
    const newField: FieldMapping = {
      field_name: 'custom_field',
      label: 'New Field',
      x: 421,
      y: 300,
      page: 0,
      font: 'Helvetica',
      font_size: 14,
      color: 0x000000,
      alignment: 'center',
      max_width: 400,
      is_bold: false,
      is_italic: false,
    }
    setFields([...fields, newField])
    setSelectedFieldIndex(fields.length)
  }

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index)
    setFields(next)
    setSelectedFieldIndex(Math.max(0, index - 1))
  }

  const saveMappings = async () => {
    if (!selectedTypeId) return
    try {
      setSaving(true)
      setError(null)
      await typesApi.updateFields(selectedTypeId, fields)
      setSuccess('Field mappings saved successfully!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save field mappings.')
    } finally {
      setSaving(false)
    }
  }

  const renderLivePreview = async () => {
    if (!selectedTypeId) return
    try {
      setPreviewing(true)
      setError(null)

      // Test row data matching Conference fields
      const sampleRow = {
        participant_name: 'Dr. Ahmed Ben Ali',
        role_description: 'has presented an Oral Communication at the congress',
        presentation_title:
          'Lobectomy via VATS in Locally Advanced Non-Small Cell Lung Cancer: Single-Center Experience',
        department: 'Service de Chirurgie Thoracique',
        city: 'Tunis',
      }

      // First save fields to ensure preview uses latest settings
      await typesApi.updateFields(selectedTypeId, fields)

      const blob = await sendApi.previewRowBlob(
        {
          type_id: selectedTypeId,
          row_data: sampleRow,
        },
        true
      ) // image format

      const imageUrl = URL.createObjectURL(blob)
      setPreviewImageUrl(imageUrl)
    } catch (err: any) {
      setError('Failed to generate live test preview.')
    } finally {
      setPreviewing(false)
    }
  }

  const currentField = fields[selectedFieldIndex]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
            <Move className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Visual Field Mapping Editor</h1>
            <p className="text-xs text-slate-500">
              Click anywhere on the PDF canvas to position text fields precisely.
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Attestation Type Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-500 font-medium">Type:</span>
            <select
              value={selectedTypeId || ''}
              onChange={(e) => setSelectedTypeId(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-sky-500"
            >
              {types.map((t, idx) => (
                <option key={t.id} value={t.id}>
                  Type #{idx} — {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Template Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-500 font-medium">Template:</span>
            <select
              value={template?.id || ''}
              onChange={(e) => handleTemplateChange(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-sky-500 max-w-[210px] truncate"
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direct Upload PDF Button */}
          <label className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
            <Upload className="h-3.5 w-3.5" />
            <span>{uploadingPdf ? 'Uploading...' : 'Upload PDF'}</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={uploadingPdf}
              onChange={handleDirectPdfUpload}
            />
          </label>

          {/* Live Preview Button */}
          <button
            onClick={renderLivePreview}
            disabled={previewing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{previewing ? 'Rendering...' : 'Live Test'}</span>
          </button>

          {/* Save Mappings Button */}
          <button
            onClick={saveMappings}
            disabled={saving}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* PDF Canvas (Center/Left) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-500 font-medium">
              <span className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-sky-600" />
                <span className="font-semibold text-slate-800">
                  {template ? template.name : 'Loading Template...'}
                </span>
                <span className="text-slate-400">({template?.original_filename || 'PDF'})</span>
              </span>
              <span>A4 Landscape: 842 × 595 pt</span>
            </div>

            {/* Interactive Canvas Container */}
            <div
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="relative w-full aspect-[841.89/595.28] bg-slate-100 rounded-lg border border-slate-300 shadow-inner overflow-hidden cursor-crosshair select-none"
            >
              {/* Template background image */}
              {template ? (
                <img
                  src={templatesApi.previewUrl(template.id, 0, 1.8)}
                  alt="Template Base"
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  Base template preview loading...
                </div>
              )}

              {/* Field Markers overlay */}
              {fields.map((f, idx) => {
                const isSelected = idx === selectedFieldIndex
                const leftPercent = (f.x / PDF_WIDTH) * 100
                const topPercent = (f.y / PDF_HEIGHT) * 100

                return (
                  <div
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFieldIndex(idx)
                    }}
                    style={{
                      left: `${leftPercent}%`,
                      top: `${topPercent}%`,
                      transform:
                        f.alignment === 'center'
                          ? 'translate(-50%, -50%)'
                          : f.alignment === 'right'
                          ? 'translate(-100%, -50%)'
                          : 'translate(0, -50%)',
                    }}
                    className={`absolute z-10 px-2.5 py-1 rounded-md text-xs font-bold transition-all shadow-md cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white ring-4 ring-sky-300/60 scale-105'
                        : 'bg-white/95 text-slate-800 border border-slate-400/80 hover:bg-sky-50'
                    }`}
                  >
                    <span>{f.label || f.field_name}</span>
                    <span className="text-[10px] ml-1 opacity-70">
                      ({f.x}, {f.y})
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live Preview Modal / Drawer */}
          {previewImageUrl && (
            <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Eye className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-bold text-sm text-slate-800">
                    Live Test Render (PyMuPDF Engine)
                  </h3>
                </div>
                <button
                  onClick={() => setPreviewImageUrl(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close Preview
                </button>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
                <img src={previewImageUrl} alt="Live Test Render" className="w-full h-auto object-contain" />
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Field List & Selected Field Properties */}
        <div className="space-y-4">
          {/* Fields list */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Fields ({fields.length})
              </h2>
              <button
                onClick={addField}
                className="inline-flex items-center space-x-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-xs font-semibold"
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {fields.map((f, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedFieldIndex(i)}
                  className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer border ${
                    i === selectedFieldIndex
                      ? 'bg-sky-50 border-sky-300 text-sky-900 font-semibold'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{f.label || f.field_name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeField(i)
                    }}
                    className="text-slate-400 hover:text-rose-600 ml-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Field Inspector */}
          {currentField ? (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 text-xs">
              <h3 className="font-bold text-slate-800 flex items-center space-x-1.5 border-b border-slate-100 pb-2">
                <Sliders className="h-4 w-4 text-sky-600" />
                <span>Field Inspector</span>
              </h3>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Variable Name</label>
                <input
                  type="text"
                  value={currentField.field_name}
                  onChange={(e) => updateSelectedField({ field_name: e.target.value })}
                  placeholder="participant_name, role_description"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Display Label</label>
                <input
                  type="text"
                  value={currentField.label}
                  onChange={(e) => updateSelectedField({ label: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">X Pos (pt)</label>
                  <input
                    type="number"
                    value={currentField.x}
                    onChange={(e) => updateSelectedField({ x: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Y Pos (pt)</label>
                  <input
                    type="number"
                    value={currentField.y}
                    onChange={(e) => updateSelectedField({ y: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Font Size</label>
                  <input
                    type="number"
                    value={currentField.font_size}
                    onChange={(e) => updateSelectedField({ font_size: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Max Width (pt)</label>
                  <input
                    type="number"
                    value={currentField.max_width}
                    onChange={(e) => updateSelectedField({ max_width: Number(e.target.value) })}
                    placeholder="0 = no wrap"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Font Family</label>
                <select
                  value={currentField.font}
                  onChange={(e) => updateSelectedField({ font: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Helvetica">Helvetica</option>
                  <option value="Helvetica-Bold">Helvetica-Bold</option>
                  <option value="Helvetica-Oblique">Helvetica-Oblique</option>
                  <option value="Times-Roman">Times-Roman</option>
                  <option value="Times-Bold">Times-Bold</option>
                  <option value="Courier">Courier</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Alignment</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => updateSelectedField({ alignment: align })}
                      className={`py-1 text-center capitalize rounded border ${
                        currentField.alignment === align
                          ? 'bg-sky-600 text-white border-sky-600 font-bold'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-1">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentField.is_bold)}
                    onChange={(e) => updateSelectedField({ is_bold: e.target.checked })}
                    className="rounded text-sky-600"
                  />
                  <span className="font-bold">Bold</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentField.is_italic)}
                    onChange={(e) => updateSelectedField({ is_italic: e.target.checked })}
                    className="rounded text-sky-600"
                  />
                  <span className="italic">Italic</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
              Select or add a field to edit its properties.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
