import React, { useEffect, useState } from 'react'
import {
  Layers,
  Plus,
  Edit2,
  Copy,
  Trash2,
  Move,
  AlertCircle,
  CheckCircle,
  FileText,
  Mail,
  ChevronRight,
} from 'lucide-react'
import { typesApi, templatesApi, AttestationType, PdfTemplate } from '../api/client'
import { NavTab } from '../components/Sidebar'

interface AttestationTypesPageProps {
  onNavigate: (tab: NavTab, typeId?: number) => void
}

export const AttestationTypesPage: React.FC<AttestationTypesPageProps> = ({ onNavigate }) => {
  const [types, setTypes] = useState<AttestationType[]>([])
  const [templates, setTemplates] = useState<PdfTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingType, setEditingType] = useState<AttestationType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    template_id: '' as string | number,
    sheet_name: '',
    name_column: 'participant_name',
    email_column: 'email',
    filename_pattern: 'Certificate_{{name}}.pdf',
    email_subject: 'Your Certificate — 5th TTSA Congress',
    email_body: 'Dear Dr. {{name}},\n\nPlease find your certificate attached.\n\nBest regards,\nThe TTSA Organizing Committee',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [typeList, tplList] = await Promise.all([
        typesApi.list(),
        templatesApi.list(),
      ])
      setTypes(typeList)
      setTemplates(tplList)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load attestation types.')
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingType(null)
    setFormData({
      name: '',
      template_id: templates[0]?.id || '',
      sheet_name: '',
      name_column: 'participant_name',
      email_column: 'email',
      filename_pattern: 'Certificate_{{name}}.pdf',
      email_subject: 'Your Certificate — 5th TTSA Congress',
      email_body: 'Dear Dr. {{name}},\n\nPlease find your certificate attached.\n\nBest regards,\nThe TTSA Organizing Committee',
      description: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (t: AttestationType) => {
    setEditingType(t)
    setFormData({
      name: t.name,
      template_id: t.template_id || '',
      sheet_name: t.sheet_name || '',
      name_column: t.name_column || 'participant_name',
      email_column: t.email_column || 'email',
      filename_pattern: t.filename_pattern || 'Certificate_{{name}}.pdf',
      email_subject: t.email_subject || '',
      email_body: t.email_body || '',
      description: t.description || '',
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Please provide a name for this attestation type.')
      return
    }

    try {
      setError(null)
      const payload = {
        ...formData,
        template_id: formData.template_id ? Number(formData.template_id) : null,
      }

      if (editingType) {
        await typesApi.update(editingType.id, payload)
        setSuccess(`Type "${formData.name}" updated successfully.`)
      } else {
        await typesApi.create(payload)
        setSuccess(`Type "${formData.name}" created successfully.`)
      }

      setIsModalOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save attestation type.')
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      const cloned = await typesApi.duplicate(id)
      setSuccess(`Duplicated as "${cloned.name}"`)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to duplicate type.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this attestation type?')) return
    try {
      await typesApi.delete(id)
      setSuccess('Attestation type deleted.')
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete type.')
    }
  }

  const insertPlaceholder = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      email_body: prev.email_body + tag,
    }))
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attestation Types</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure participation categories (e.g. Oral, Poster, Attendee), each with its own sheet mapping, fields, and email template.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Attestation Type</span>
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

      {/* Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {types.map((t, index) => (
          <div
            key={t.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Type #{index}
                    </span>
                    {index === 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Default
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-slate-800 mt-1.5">{t.name}</h3>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => openEditModal(t)}
                    className="p-1.5 text-slate-400 hover:text-sky-600 rounded-md hover:bg-slate-50"
                    title="Edit configuration"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(t.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-50"
                    title="Duplicate type"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-50"
                    title="Delete type"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {t.description && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{t.description}</p>
              )}

              {/* Specs */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Excel Sheet:</span>
                  <span className="font-medium text-slate-700">{t.sheet_name || '(Any sheet)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Name Column:</span>
                  <span className="font-medium text-slate-700">{t.name_column}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email Column:</span>
                  <span className="font-medium text-slate-700">{t.email_column}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Template:</span>
                  <span className="font-medium text-slate-700 truncate max-w-[150px]">
                    {t.template?.name || (t.template_id ? `ID #${t.template_id}` : 'Default TTSA')}
                  </span>
                </div>
                {/* Dynamic Fields */}
                <div className="pt-2">
                  <span className="text-slate-400 block mb-1">Configured Fields:</span>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      try {
                        const m = JSON.parse(t.field_mappings || '[]');
                        return m.map((f: any, idx: number) => (
                          <span key={idx} className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                            {f.label || f.field_name}
                          </span>
                        ));
                      } catch (_) {
                        return <span className="text-[10px] text-slate-400">None</span>;
                      }
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => onNavigate('field-editor', t.id)}
                className="w-full inline-flex items-center justify-center space-x-2 py-2 bg-slate-50 hover:bg-sky-50 text-sky-700 border border-slate-200 hover:border-sky-300 rounded-lg text-xs font-semibold transition-colors"
              >
                <Move className="h-3.5 w-3.5 text-sky-600" />
                <span>Configure Field Positions</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {editingType ? `Edit ${editingType.name}` : 'New Attestation Type'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Type Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Oral Communication, Poster, Attendee"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base PDF Template
                </label>
                <select
                  value={formData.template_id}
                  onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  <option value="">Default Congress Template (Certification_template.pdf)</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.original_filename})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Excel Sheet Name
                  </label>
                  <input
                    type="text"
                    value={formData.sheet_name}
                    onChange={(e) => setFormData({ ...formData, sheet_name: e.target.value })}
                    placeholder="e.g. Conference or Eposter"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PDF Filename Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.filename_pattern}
                    onChange={(e) => setFormData({ ...formData, filename_pattern: e.target.value })}
                    placeholder="Certificate_{{name}}.pdf"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Name Column
                  </label>
                  <input
                    type="text"
                    value={formData.name_column}
                    onChange={(e) => setFormData({ ...formData, name_column: e.target.value })}
                    placeholder="Author, participant_name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Email Column
                  </label>
                  <input
                    type="text"
                    value={formData.email_column}
                    onChange={(e) => setFormData({ ...formData, email_column: e.target.value })}
                    placeholder="Email, Submitter Email"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={formData.email_subject}
                  onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                  placeholder="Your Certificate — 5th TTSA Congress"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Email Body</label>
                  <div className="space-x-1">
                    <button
                      type="button"
                      onClick={() => insertPlaceholder('{{name}}')}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                    >
                      + {"{{name}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertPlaceholder('{{presentation_title}}')}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                    >
                      + {"{{presentation_title}}"}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={formData.email_body}
                  onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Internal Description (optional)
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. For doctors presenting oral papers in hall A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  {editingType ? 'Save Changes' : 'Create Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

