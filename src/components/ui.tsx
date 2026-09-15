import type { ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'
import type { CustomerStatus, InvoiceStatus, JobStatus, LeadStatus } from '../lib/types'

// ---- Modal ----------------------------------------------------------------
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- Form fields ----------------------------------------------------------
export function TextField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        {...props}
      />
    </div>
  )
}

export function SelectField({
  label, children, ...props
}: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function TextAreaField({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        {...props}
      />
    </div>
  )
}

export function FormActions({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  const { t } = useI18n()
  return (
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
      <Button type="submit" disabled={saving}>{saving ? t('common.saving') : label}</Button>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
}

export function Button({
  children, onClick, variant = 'primary', size = 'md', type = 'button', disabled, title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm'
  const variants = variant === 'primary'
    ? 'bg-[#0c2340] text-white hover:bg-[#15315a]'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${sizes} ${variants}`}>
      {children}
    </button>
  )
}

export function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useI18n()
  return (
    <button
      onClick={onClick} disabled={disabled} title={t('common.delete')} aria-label={t('common.delete')}
      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.748 1.748 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15z"/></svg>
    </button>
  )
}

const invoiceColors: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-500 ring-slate-200',
  sent: 'bg-blue-50 text-blue-700 ring-blue-200',
  overdue: 'bg-red-50 text-red-700 ring-red-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const customerColors: Record<CustomerStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  due_for_service: 'bg-amber-50 text-amber-700 ring-amber-200',
  win_back: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const jobColors: Record<JobStatus, string> = {
  quote: 'bg-blue-50 text-blue-700 ring-blue-200',
  scheduled: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_progress: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const leadColors: Record<LeadStatus, string> = {
  new: 'bg-blue-50 text-blue-700 ring-blue-200',
  contacted: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  quoted: 'bg-amber-50 text-amber-700 ring-amber-200',
  won: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lost: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export function Badge({ status, kind }: { status: string; kind: 'invoice' | 'customer' | 'job' | 'lead' }) {
  const { t } = useI18n()
  const map = kind === 'invoice' ? invoiceColors
    : kind === 'customer' ? customerColors
    : kind === 'lead' ? leadColors
    : jobColors
  const cls = (map as Record<string, string>)[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {t(`status.${status}` as TKey)}
    </span>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Loading() {
  const { t } = useI18n()
  return <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
}

export function EmptyState({ message }: { message: string }) {
  return <div className="p-10 text-center text-sm text-slate-400">{message}</div>
}

export function Collapsible({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <div className="mt-8">
      <button onClick={onToggle} className="flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
        </svg>
        {label}
      </button>
      {open && children}
    </div>
  )
}

// ---- Language switch ------------------------------------------------------
export function LangSwitch({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { lang, setLang, t } = useI18n()
  const wrap = tone === 'dark'
    ? 'bg-white/10 ring-white/10'
    : 'bg-slate-100 ring-slate-200'
  const active = tone === 'dark' ? 'bg-white text-[#0c2340]' : 'bg-[#0c2340] text-white'
  const idle = tone === 'dark' ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-800'

  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg p-0.5 ring-1 ring-inset ${wrap}`} title={t('lang.label')}>
      {(['en', 'ru'] as const).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${lang === l ? active : idle}`}
        >
          {t(l === 'en' ? 'lang.en' : 'lang.ru')}
        </button>
      ))}
    </div>
  )
}
