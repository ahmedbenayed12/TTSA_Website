import React, { useEffect, useState } from 'react'
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  CheckSquare,
  Square,
  Trash2,
  Clock,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'
import {
  excelApi,
  typesApi,
  AttestationType,
  ExcelUploadResponse,
  ExcelValidationResult,
  SavedExcelFile,
} from '../api/client'
import { NavTab } from '../components/Sidebar'

const STORAGE_KEY = 'ttsa_selected_excel_id'

interface ExcelImportPageProps {
  onNavigate: (tab: NavTab, jobId?: number) => void
}

export const ExcelImportPage: React.FC<ExcelImportPageProps> = ({ onNavigate }) => {
  const [types, setTypes] = useState<AttestationType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)

  const [savedFiles, setSavedFiles] = useState<SavedExcelFile[]>([])
  const [uploadResult, setUploadResult] = useState<ExcelUploadResponse | null>(null)
  const [selectedSheet, setSelectedSheet] = useState<string>('')

  const [validation, setValidation] = useState<ExcelValidationResult | null>(null)
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([])

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    initData()
  }, [])

  const initData = async () => {
    try {
      setLoading(true)
      const [typeList, filesList] = await Promise.all([
        typesApi.list().catch(() => []),
        excelApi.listFiles().catch(() => []),
      ])

      setTypes(typeList)
      setSavedFiles(filesList)

      const initialType = typeList.length > 0 ? typeList[0] : null
      if (initialType) {
        setSelectedTypeId(initialType.id)
      }

      // Check for saved Excel file ID in localStorage or select latest
      const savedId = localStorage.getItem(STORAGE_KEY)
      let targetFile = filesList.find((f) => String(f.id) === savedId)

      if (!targetFile && filesList.length > 0) {
        targetFile = filesList[0]
      }

      if (targetFile) {
        await loadSavedFile(targetFile.id, initialType?.id || null)
      }
    } catch (err: any) {
      setError('Failed to initialize Excel import page.')
    } finally {
      setLoading(false)
    }
  }

  const loadSavedFile = async (fileId: number, typeIdOverride?: number | null) => {
    try {
      setLoading(true)
      setError(null)
      const data = await excelApi.getFile(fileId)
      setUploadResult(data)
      localStorage.setItem(STORAGE_KEY, String(fileId))

      if (data.sheet_names.length > 0) {
        // Look for sheet named Conference or use first sheet
        const confSheet = data.sheet_names.find(
          (s) => s.toLowerCase() === 'conference'
        )
        const chosenSheet = confSheet || data.sheet_names[0]
        setSelectedSheet(chosenSheet)

        const activeTypeId = typeIdOverride !== undefined ? typeIdOverride : selectedTypeId
        await validateSheetData(data.file_path, chosenSheet, activeTypeId, data)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load saved Excel file.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setError(null)
      const res = await excelApi.upload(file)
      setUploadResult(res)

      // Refresh saved files list
      const updatedFiles = await excelApi.listFiles().catch(() => [])
      setSavedFiles(updatedFiles)

      if (res.id) {
        localStorage.setItem(STORAGE_KEY, String(res.id))
      }

      setSuccess(`Excel file "${res.original_filename}" uploaded and saved permanently!`)
      setTimeout(() => setSuccess(null), 3500)

      if (res.sheet_names.length > 0) {
        const confSheet = res.sheet_names.find(
          (s) => s.toLowerCase() === 'conference'
        )
        const firstSheet = confSheet || res.sheet_names[0]
        setSelectedSheet(firstSheet)
        await validateSheetData(res.file_path, firstSheet, selectedTypeId, res)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload Excel file.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeleteFile = async (fileId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this saved Excel file?')) return

    try {
      await excelApi.deleteFile(fileId)
      const updatedFiles = await excelApi.listFiles().catch(() => [])
      setSavedFiles(updatedFiles)

      const savedId = localStorage.getItem(STORAGE_KEY)
      if (String(fileId) === savedId) {
        localStorage.removeItem(STORAGE_KEY)
        if (updatedFiles.length > 0) {
          await loadSavedFile(updatedFiles[0].id)
        } else {
          setUploadResult(null)
          setValidation(null)
        }
      }
      setSuccess('Excel file removed.')
      setTimeout(() => setSuccess(null), 2500)
    } catch (err: any) {
      setError('Failed to delete file.')
    }
  }

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet)
    if (uploadResult) {
      const matchingType = types.find(
        (t) => t.sheet_name && t.sheet_name.toLowerCase() === sheet.toLowerCase()
      )
      const typeIdToUse = matchingType ? matchingType.id : selectedTypeId
      if (matchingType) {
        setSelectedTypeId(matchingType.id)
      }
      validateSheetData(uploadResult.file_path, sheet, typeIdToUse, uploadResult)
    }
  }

  const validateSheetData = async (
    filePath: string,
    sheetName: string,
    typeId: number | null,
    sourceResult?: ExcelUploadResponse | null
  ) => {
    const targetType = types.find((t) => t.id === typeId) || types[0]
    const emailCol = targetType?.email_column || 'email'
    const nameCol = targetType?.name_column || 'participant_name'

    try {
      const val = await excelApi.validate({
        file_path: filePath,
        sheet_name: sheetName,
        email_column: emailCol,
        name_column: nameCol,
      })
      setValidation(val)

      // Auto-select all rows
      const activeData = sourceResult || uploadResult
      const sheetData = activeData?.sheets[sheetName]
      if (sheetData) {
        setSelectedRowIndices(sheetData.rows.map((r) => r._row_index))
      }
    } catch (err: any) {
      console.warn('Validation error:', err)
    }
  }

  const toggleSelectAll = () => {
    const currentSheetRows = uploadResult?.sheets[selectedSheet]?.rows || []
    if (selectedRowIndices.length === currentSheetRows.length) {
      setSelectedRowIndices([])
    } else {
      setSelectedRowIndices(currentSheetRows.map((r) => r._row_index))
    }
  }

  const toggleRow = (idx: number) => {
    setSelectedRowIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    )
  }

  const handleCreateJob = async () => {
    if (!uploadResult || !selectedSheet || !selectedTypeId) return

    if (selectedRowIndices.length === 0) {
      setError('Please select at least one row to import.')
      return
    }

    try {
      setCreatingJob(true)
      setError(null)
      const job = await excelApi.createJob({
        type_id: selectedTypeId,
        file_path: uploadResult.file_path,
        sheet_name: selectedSheet,
        selected_indices: selectedRowIndices,
      })

      const noEmailCount = validation?.no_email_rows || 0
      const emailCount = validation?.valid_rows || 0

      if (emailCount === 0 && noEmailCount > 0) {
        setSuccess(
          `Generated ${job.total_rows} certificate(s) in "No Email Address Certification"! Redirecting...`
        )
        setTimeout(() => {
          onNavigate('no-email-certs')
        }, 1200)
      } else {
        setSuccess(
          `Job #${job.id} created (${job.total_rows} recipients${noEmailCount > 0 ? `, including ${noEmailCount} saved to No Email Certifications` : ''})! Redirecting...`
        )
        setTimeout(() => {
          onNavigate('recipients-send', job.id)
        }, 1200)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create send job.')
    } finally {
      setCreatingJob(false)
    }
  }

  const currentSheetData = uploadResult?.sheets[selectedSheet]
  const currentType = types.find((t) => t.id === selectedTypeId)

  const findMatchingCol = (target: string | undefined) => {
    if (!target || !currentSheetData) return target || ''
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '')
    const targetNorm = norm(target)
    const exact = currentSheetData.columns.find((c) => c === target)
    if (exact) return exact
    const matched = currentSheetData.columns.find((c) => norm(c) === targetNorm)
    if (matched) return matched
    if (targetNorm.includes('email') || targetNorm.includes('mail')) {
      const emailCol = currentSheetData.columns.find(
        (c) => norm(c).includes('email') || norm(c).includes('mail')
      )
      if (emailCol) return emailCol
    }
    if (
      targetNorm.includes('name') ||
      targetNorm.includes('participant') ||
      targetNorm.includes('author')
    ) {
      const nameCol = currentSheetData.columns.find(
        (c) => norm(c).includes('name') || norm(c).includes('participant') || norm(c).includes('nom')
      )
      if (nameCol) return nameCol
    }
    return target
  }

  const detectedNameCol = findMatchingCol(currentType?.name_column)
  const detectedEmailCol = findMatchingCol(currentType?.email_column)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Excel Participant Import</h1>
          <p className="text-sm text-slate-500 mt-1">
            Uploaded workbooks are saved permanently in the application just like PDF templates.
          </p>
        </div>
        <button
          onClick={initData}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 shadow-xs"
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
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Top Section: Saved Excel Files & Upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Saved Excel Files List (Left 1 Col) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <FolderOpen className="h-4 w-4 text-sky-600" />
                <span>Saved Files ({savedFiles.length})</span>
              </span>
            </div>

            {savedFiles.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No saved Excel files yet.</p>
            ) : (
              <div className="space-y-2 max-h-[180px] overflow-y-auto">
                {savedFiles.map((f) => {
                  const isSelected = uploadResult?.file_path === f.file_path
                  return (
                    <div
                      key={f.id}
                      onClick={() => loadSavedFile(f.id)}
                      className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer border transition-colors ${
                        isSelected
                          ? 'bg-sky-50 border-sky-300 text-sky-900 font-semibold'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <p className="truncate font-medium">{f.filename}</p>
                        <p className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{f.total_rows} rows</span>
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteFile(f.id, e)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Delete file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick upload button */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <label className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
              <Upload className="h-3.5 w-3.5" />
              <span>{uploading ? 'Uploading...' : 'Upload New Excel'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={uploading}
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Active Workbook Info & Sheet Matcher (Right 2 Cols) */}
        <div className="md:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          {uploadResult ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-900">{uploadResult.original_filename}</p>
                    <p className="text-xs text-slate-400">
                      {uploadResult.sheet_names.length} sheet(s) detected • Persistent in app
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-slate-500">Link to:</span>
                  <select
                    value={selectedTypeId || ''}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      setSelectedTypeId(id)
                      validateSheetData(uploadResult.file_path, selectedSheet, id, uploadResult)
                    }}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sheet tabs */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-slate-500">Sheet:</span>
                <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
                  {uploadResult.sheet_names.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => handleSheetChange(sheet)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        selectedSheet === sheet
                          ? 'bg-white text-sky-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sheet}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <FileSpreadsheet className="h-10 w-10 mb-2 opacity-40 text-sky-600" />
              <p className="text-sm font-semibold text-slate-700">No Excel file currently selected</p>
              <p className="text-xs text-slate-400 mt-1">
                Select a saved file from the list or upload a new `.xlsx` file.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Validation & Stats Strip */}
      {uploadResult && validation && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Valid Email Recipients</p>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">{validation.valid_rows}</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">No Email (PDF Only)</p>
              <p className="text-xl font-bold text-amber-600 mt-0.5">
                {validation.no_email_rows ?? 0}
              </p>
              <p className="text-[10px] text-slate-400">Saved to No Email Certifications</p>
            </div>
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Selected For Batch</p>
              <p className="text-xl font-bold text-sky-600 mt-0.5">
                {selectedRowIndices.length} / {currentSheetData?.row_count || 0}
              </p>
            </div>
            <button
              onClick={handleCreateJob}
              disabled={creatingJob || selectedRowIndices.length === 0}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
            >
              <span>{creatingJob ? 'Queuing...' : 'Create Send Job'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Data Table Preview */}
      {currentSheetData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-sky-600"
              >
                {selectedRowIndices.length === currentSheetData.rows.length ? (
                  <CheckSquare className="h-4 w-4 text-sky-600" />
                ) : (
                  <Square className="h-4 w-4 text-slate-400" />
                )}
                <span>Select All ({currentSheetData.row_count} rows)</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 flex items-center space-x-3">
              <span>
                Name col:{' '}
                <strong className="text-slate-800">
                  {detectedNameCol !== currentType?.name_column
                    ? `${detectedNameCol} (matched)`
                    : detectedNameCol}
                </strong>
              </span>
              <span>•</span>
              <span>
                Email col:{' '}
                <strong className="text-slate-800">
                  {detectedEmailCol !== currentType?.email_column
                    ? `${detectedEmailCol} (matched)`
                    : detectedEmailCol}
                </strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 w-10">#</th>
                  {currentSheetData.columns.map((col) => (
                    <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentSheetData.rows.map((row) => {
                  const isSelected = selectedRowIndices.includes(row._row_index)
                  return (
                    <tr
                      key={row._row_index}
                      onClick={() => toggleRow(row._row_index)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by tr onClick
                          className="rounded text-sky-600 cursor-pointer"
                        />
                      </td>
                      {currentSheetData.columns.map((col) => (
                        <td key={col} className="py-2.5 px-3 text-slate-700 whitespace-nowrap max-w-xs truncate">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
