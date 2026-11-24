import React, { useEffect, useState } from 'react'
import {
  FileSpreadsheet,
  Upload,
  Layers,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react'
import {
  excelApi,
  typesApi,
  AttestationType,
  ExcelUploadResponse,
  ExcelValidationResult,
} from '../api/client'
import { NavTab } from '../components/Sidebar'

interface ExcelImportPageProps {
  onNavigate: (tab: NavTab, jobId?: number) => void
}

export const ExcelImportPage: React.FC<ExcelImportPageProps> = ({ onNavigate }) => {
  const [types, setTypes] = useState<AttestationType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  
  const [uploadResult, setUploadResult] = useState<ExcelUploadResponse | null>(null)
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  
  const [validation, setValidation] = useState<ExcelValidationResult | null>(null)
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([])

  const [loading, setLoading] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadTypes()
  }, [])

  const loadTypes = async () => {
    try {
      const list = await typesApi.list()
      setTypes(list)
      if (list.length > 0) {
        setSelectedTypeId(list[0].id)
      }
    } catch (err: any) {
      setError('Failed to load attestation types.')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setError(null)
      const res = await excelApi.upload(file)
      setUploadResult(res)
      if (res.sheet_names.length > 0) {
        const firstSheet = res.sheet_names[0]
        setSelectedSheet(firstSheet)
        validateSheetData(res.file_path, firstSheet, selectedTypeId)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload Excel file.')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet)
    if (uploadResult) {
      // Auto-match attestation type by sheet name if matching
      const matchingType = types.find(
        (t) => t.sheet_name && t.sheet_name.toLowerCase() === sheet.toLowerCase()
      )
      const typeIdToUse = matchingType ? matchingType.id : selectedTypeId
      if (matchingType) {
        setSelectedTypeId(matchingType.id)
      }
      validateSheetData(uploadResult.file_path, sheet, typeIdToUse)
    }
  }

  const validateSheetData = async (filePath: string, sheetName: string, typeId: number | null) => {
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
      const sheetData = uploadResult?.sheets[sheetName]
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

      setSuccess(`Job #${job.id} created with ${job.total_rows} recipients!`)
      setTimeout(() => {
        onNavigate('recipients-send', job.id)
      }, 1200)
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
            Upload congress registration workbooks (.xlsx). Supports multi-sheet files with per-sheet column mapping.
          </p>
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

      {/* Upload Box */}
      {!uploadResult && (
        <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/30 transition-colors text-center">
          <FileSpreadsheet className="h-12 w-12 text-sky-600 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800">Choose your Excel Workbook</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Upload `.xlsx` containing conference participants (e.g. donnees.xlsx or Excel_test.xlsx).
          </p>
          <label className="mt-5 inline-flex items-center space-x-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow-md cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            <span>Select Excel File</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      )}

      {/* If file uploaded */}
      {uploadResult && (
        <div className="space-y-6">
          {/* File bar & Sheet selector */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900">{uploadResult.original_filename}</p>
                <p className="text-xs text-slate-400">
                  {uploadResult.sheet_names.length} sheet(s) detected
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Sheet selector tabs */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {uploadResult.sheet_names.map((sheet) => (
                  <button
                    key={sheet}
                    onClick={() => handleSheetChange(sheet)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      selectedSheet === sheet
                        ? 'bg-white text-sky-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sheet}
                  </button>
                ))}
              </div>

              {/* Attestation Type Matcher */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-slate-500">Link to:</span>
                <select
                  value={selectedTypeId || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    setSelectedTypeId(id)
                    validateSheetData(uploadResult.file_path, selectedSheet, id)
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

              {/* Re-upload button */}
              <label className="text-xs text-slate-500 hover:text-sky-600 cursor-pointer underline">
                Replace File
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Validation & Stats Strip */}
          {validation && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Valid Recipients</p>
                  <p className="text-xl font-bold text-emerald-600 mt-0.5">{validation.valid_rows}</p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Validation Warnings</p>
                  <p className="text-xl font-bold text-amber-600 mt-0.5">
                    {validation.warnings.length}
                  </p>
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
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5"
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
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
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
                            isSelected ? 'bg-sky-50/40' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by row click
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                          </td>
                          {currentSheetData.columns.map((col) => (
                            <td key={col} className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
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
      )}
    </div>
  )
}

