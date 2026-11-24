import axios from 'axios'

// Dynamically determine API base URL
const isSubpath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/certification')
export const API_BASE = isSubpath ? '/api/cert' : '/api'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const urlParams = new URLSearchParams(window.location.search)
  const urlToken = urlParams.get('token')
  if (urlToken) {
    localStorage.setItem('ttsa_token', urlToken)
    localStorage.setItem('ttsa_role', 'admin')
    return urlToken
  }
  return localStorage.getItem('ttsa_token')
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach Bearer token to all requests if present
api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface PdfTemplate {
  id: number
  name: string
  original_filename: string
  path: string
  page_count: number
  has_acroform: boolean
  created_at: string
}

export interface FieldMapping {
  field_name: string
  label: string
  x: number
  y: number
  page: number
  font: string
  font_size: number
  color: number
  alignment: 'left' | 'center' | 'right'
  max_width: number
  is_bold?: boolean
  is_italic?: boolean
}

export interface AttestationType {
  id: number
  name: string
  template_id: number | null
  template?: PdfTemplate | null
  field_mappings: string // JSON
  email_subject: string
  email_body: string
  filename_pattern: string
  description: string
  email_column: string
  name_column: string
  sheet_name: string
  created_at: string
}

export interface SendJob {
  id: number
  type_id: number | null
  excel_path: string
  total_rows: number
  sent_count: number
  failed_count: number
  status: 'pending' | 'running' | 'done' | 'partial' | 'error'
  created_at: string
  updated_at: string
}

export interface SendLog {
  id: number
  job_id: number
  row_index: number
  recipient_email: string
  recipient_name: string
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  error_message: string
  generated_pdf_path: string
  sent_at: string | null
  row_data: string
}

export interface SheetData {
  columns: string[]
  rows: Record<string, any>[]
  row_count: number
}

export interface ExcelUploadResponse {
  id?: number
  file_path: string
  original_filename: string
  sheet_names: string[]
  sheets: Record<string, SheetData>
}

export interface SavedExcelFile {
  id: number
  filename: string
  file_path: string
  sheet_names: string[]
  total_rows: number
  created_at: string
}

export interface ValidationErrorItem {
  row_index: number
  field: string
  message: string
}

export interface ExcelValidationResult {
  valid_rows: number
  errors: ValidationErrorItem[]
  warnings: ValidationErrorItem[]
}

export const templatesApi = {
  list: async () => (await api.get<PdfTemplate[]>('/templates/')).data,
  upload: async (file: File, name: string = '') => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post<PdfTemplate>(`/templates/upload?name=${encodeURIComponent(name)}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
  delete: async (id: number) => (await api.delete(`/templates/${id}`)).data,
  previewUrl: (id: number, page: number = 0, zoom: number = 2.0) => {
    const token = getAuthToken()
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''
    return `${API_BASE}/templates/${id}/preview?page=${page}&zoom=${zoom}&t=${Date.now()}${tokenParam}`
  },
  fields: async (id: number) => (await api.get<any[]>(`/templates/${id}/fields`)).data,
}

export const typesApi = {
  list: async () => (await api.get<AttestationType[]>('/types/')).data,
  get: async (id: number) => (await api.get<AttestationType>(`/types/${id}`)).data,
  create: async (data: Partial<AttestationType> & { field_mappings?: FieldMapping[] }) =>
    (await api.post<AttestationType>('/types/', data)).data,
  update: async (id: number, data: Partial<AttestationType> & { field_mappings?: FieldMapping[] }) =>
    (await api.put<AttestationType>(`/types/${id}`, data)).data,
  delete: async (id: number) => (await api.delete(`/types/${id}`)).data,
  duplicate: async (id: number) => (await api.post<AttestationType>(`/types/${id}/duplicate`)).data,
  getFields: async (id: number) => (await api.get<FieldMapping[]>(`/types/${id}/fields`)).data,
  updateFields: async (id: number, fields: FieldMapping[]) =>
    (await api.put<FieldMapping[]>(`/types/${id}/fields`, fields)).data,
}

export const excelApi = {
  listFiles: async () => (await api.get<SavedExcelFile[]>('/excel/files')).data,
  getFile: async (id: number) => (await api.get<ExcelUploadResponse & { id: number }>(`/excel/files/${id}`)).data,
  deleteFile: async (id: number) => (await api.delete<{ message: string }>(`/excel/files/${id}`)).data,
  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post<ExcelUploadResponse>('/excel/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
  validate: async (data: {
    file_path: string
    sheet_name: string
    email_column: string
    name_column: string
    required_columns?: string[]
  }) => (await api.post<ExcelValidationResult>('/excel/validate', data)).data,
  createJob: async (data: {
    type_id: number
    file_path: string
    sheet_name: string
    selected_indices?: number[]
  }) => (await api.post<SendJob>('/excel/create-job', data)).data,
}

export const sendApi = {
  listJobs: async () => (await api.get<SendJob[]>('/send/jobs')).data,
  getJob: async (id: number) => (await api.get<SendJob>(`/send/jobs/${id}`)).data,
  getLogs: async (jobId: number, status?: string) =>
    (await api.get<SendLog[]>(`/send/jobs/${jobId}/logs${status ? `?status_filter=${status}` : ''}`)).data,
  start: async (jobId: number) => (await api.post<{ message: string; count: number }>(`/send/start/${jobId}`)).data,
  retry: async (jobId: number) => (await api.post<{ message: string }>(`/send/retry/${jobId}`)).data,
  cancel: async (jobId: number) => (await api.post<{ message: string }>(`/send/cancel/${jobId}`)).data,
  exportCsvUrl: (jobId: number) => {
    const token = getAuthToken()
    return `${API_BASE}/send/jobs/${jobId}/export-csv${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
  downloadZipUrl: (jobId: number) => {
    const token = getAuthToken()
    return `${API_BASE}/send/jobs/${jobId}/download-zip${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
  previewRowUrl: () => `${API_BASE}/send/preview-row?as_image=false`,
  previewRowBlob: async (payload: { job_id?: number; log_id?: number; type_id?: number; row_data?: any }, asImage = false) => {
    const res = await api.post(`/send/preview-row?as_image=${asImage}`, payload, {
      responseType: 'blob',
    })
    return res.data
  },
}

export const settingsApi = {
  getGmail: async () => (await api.get<any>('/settings/gmail')).data,
  saveSmtp: async (data: any) => (await api.post<any>('/settings/gmail/smtp', data)).data,
  getOAuthUrl: async (data?: any) => (await api.post<{ auth_url: string }>('/settings/gmail/oauth/url', data)).data,
  exchangeOAuth: async (data: { code: string; client_id?: string; client_secret?: string; redirect_uri?: string }) =>
    (await api.post<any>('/settings/gmail/oauth/callback', data)).data,
  testEmail: async (testEmail: string) => (await api.post<any>('/settings/test', { test_email: testEmail })).data,
}
