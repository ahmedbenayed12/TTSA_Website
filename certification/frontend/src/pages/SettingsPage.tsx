import React, { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  Mail,
  ShieldCheck,
  Key,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react'
import { settingsApi } from '../api/client'

const getErrorMessage = (err: any, fallback: string): string => {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
  }
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  return fallback
}

export const SettingsPage: React.FC = () => {
  const [configStatus, setConfigStatus] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'smtp' | 'oauth2'>('smtp')

  // SMTP form
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    sender_email: '',
  })

  // OAuth form
  const [oauthForm, setOauthForm] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: 'http://localhost:8000/api/gmail/callback',
    code: '',
  })
  const [authUrl, setAuthUrl] = useState<string | null>(null)

  // Test send form
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const res = await settingsApi.getGmail()
      setConfigStatus(res)
      if (res.auth_type === 'oauth2') {
        setActiveTab('oauth2')
      }
      if (res.sender_email && !smtpForm.sender_email) {
        setSmtpForm((prev) => ({
          ...prev,
          smtp_user: res.sender_email,
          sender_email: res.sender_email,
        }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError(null)
      await settingsApi.saveSmtp({
        ...smtpForm,
        smtp_port: Number(smtpForm.smtp_port),
      })
      setSuccess('SMTP credentials encrypted and saved successfully!')
      await loadStatus()
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save SMTP configuration.'))
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateOAuthUrl = async () => {
    try {
      setError(null)
      const res = await settingsApi.getOAuthUrl({
        client_id: oauthForm.client_id,
        client_secret: oauthForm.client_secret,
        redirect_uri: oauthForm.redirect_uri,
      })
      setAuthUrl(res.auth_url)
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to generate OAuth URL.'))
    }
  }

  const handleExchangeOAuthCode = async () => {
    if (!oauthForm.code.trim()) {
      setError('Please paste the authorization code from Google.')
      return
    }
    try {
      setSaving(true)
      setError(null)
      await settingsApi.exchangeOAuth({
        code: oauthForm.code,
        client_id: oauthForm.client_id,
        client_secret: oauthForm.client_secret,
        redirect_uri: oauthForm.redirect_uri,
      })
      setSuccess('Google OAuth authorization successful!')
      await loadStatus()
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to exchange authorization code.'))
    } finally {
      setSaving(false)
    }
  }

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testEmail.trim()) return

    try {
      setTesting(true)
      setTestResult(null)
      setError(null)
      const res = await settingsApi.testEmail(testEmail)
      setTestResult({
        success: true,
        message: res.message || `Test email sent to ${testEmail}!`,
      })
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Failed to send test email.')
      setTestResult({
        success: false,
        message: msg,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email & Gmail Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure delivery credentials via Gmail App Password (SMTP) or Google OAuth 2.0. All secrets are encrypted with Fernet symmetric cryptography.
        </p>
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

      {/* Current Status Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-xl ${configStatus?.configured ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Email Dispatcher Status:{' '}
              {configStatus?.configured ? (
                <span className="text-emerald-600">Active ({configStatus.auth_type?.toUpperCase()})</span>
              ) : (
                <span className="text-slate-400">Not configured</span>
              )}
            </h3>
            {configStatus?.sender_email && (
              <p className="text-xs text-slate-500 mt-0.5">
                Sending as: <strong className="text-slate-700">{configStatus.sender_email}</strong>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-4">
        <button
          onClick={() => setActiveTab('smtp')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'smtp'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Option A: App Password (SMTP)
        </button>
        <button
          onClick={() => setActiveTab('oauth2')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'oauth2'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Option B: Google OAuth 2.0
        </button>
      </div>

      {/* Option A: SMTP Form */}
      {activeTab === 'smtp' && (
        <form onSubmit={handleSaveSmtp} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-100 text-xs text-sky-800 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" />
              How to get a Gmail App Password:
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-sky-700">
              <li>Enable 2-Step Verification on your Google Account (myaccount.google.com/security).</li>
              <li>Under "2-Step Verification", select "App passwords".</li>
              <li>Create a new app password named "TTSA Attestation".</li>
              <li>Copy the 16-character code and paste it below.</li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SMTP Host
              </label>
              <input
                type="text"
                required
                value={smtpForm.smtp_host}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SMTP Port
              </label>
              <input
                type="number"
                required
                value={smtpForm.smtp_port}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_port: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gmail Address (Username) *
              </label>
              <input
                type="email"
                required
                value={smtpForm.smtp_user}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_user: e.target.value })}
                placeholder="your.congress@gmail.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                16-Character App Password *
              </label>
              <input
                type="password"
                required
                value={smtpForm.smtp_password}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_password: e.target.value })}
                placeholder="xxxx xxxx xxxx xxxx"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sender Display Email
            </label>
            <input
              type="email"
              value={smtpForm.sender_email}
              onChange={(e) => setSmtpForm({ ...smtpForm, sender_email: e.target.value })}
              placeholder="Defaults to username above"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
            >
              {saving ? 'Encrypting & Saving...' : 'Save SMTP Configuration'}
            </button>
          </div>
        </form>
      )}

      {/* Option B: OAuth2 Form */}
      {activeTab === 'oauth2' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Google Client ID
              </label>
              <input
                type="text"
                value={oauthForm.client_id}
                onChange={(e) => setOauthForm({ ...oauthForm, client_id: e.target.value })}
                placeholder="xxxx.apps.googleusercontent.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Google Client Secret
              </label>
              <input
                type="password"
                value={oauthForm.client_secret}
                onChange={(e) => setOauthForm({ ...oauthForm, client_secret: e.target.value })}
                placeholder="GOCSPX-xxxx"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateOAuthUrl}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5"
            >
              <span>Generate Google Sign-In Link</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>

            {authUrl && (
              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                <p className="text-xs text-indigo-900 font-semibold">
                  Step 1: Open this link and authorize your Google Account:
                </p>
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  Sign in with Google →
                </a>
                <p className="text-xs text-indigo-900 font-semibold pt-2">
                  Step 2: Paste the authorization code returned by Google:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={oauthForm.code}
                    onChange={(e) => setOauthForm({ ...oauthForm, code: e.target.value })}
                    placeholder="4/0Af... authorization code"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleExchangeOAuthCode}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                  >
                    Confirm Code
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Email Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2">
          <Send className="h-5 w-5 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-800">Test Connection & Dispatch</h2>
        </div>
        <p className="text-xs text-slate-500">
          Verify that your Gmail configuration works by sending an instant test email to your inbox.
        </p>

        <form onSubmit={handleSendTestEmail} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Enter your recipient email (e.g. test@example.com)"
            className="flex-1 px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={testing || !configStatus?.configured}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
          >
            {testing ? 'Sending Test...' : 'Send Test Email'}
          </button>
        </form>

        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-center space-x-2 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  )
}

