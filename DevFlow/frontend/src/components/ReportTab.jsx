import { useState } from 'react'
import Icon from './Icon'
import { Panel } from './ui'
import { API_URL } from '../utils/constants'
import { formatDate, formatNumber } from '../utils/format'

function Badge({ kind }) {
  const styles = {
    measured: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    estimate: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    info: 'bg-white/5 text-gray-400 border-white/10',
  }
  const labels = { measured: 'Measured', estimate: 'Estimate', info: 'Info' }
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles[kind]}`}>{labels[kind]}</span>
}

function buildSections(result) {
  const repo = result.repository
  const stats = result.stats
  const analytics = result.analytics
  const architecture = result.architecture

  const topLanguages =
    (result.language_stats || [])
      .slice(0, 3)
      .map((lang) => `${lang.name} ${lang.percent.toFixed(1)}%`)
      .join(', ') || '—'

  return [
    {
      title: 'Repository',
      kind: 'measured',
      rows: [
        ['Name', repo.full_name],
        ['Description', repo.description || '—'],
        ['Primary language', repo.primary_language || '—'],
        ['License', repo.license || 'Not specified'],
        ['Stars', formatNumber(repo.stars)],
        ['Forks', formatNumber(repo.forks)],
        ['Last push', formatDate(repo.pushed_at)],
      ],
    },
    {
      title: 'Structure',
      kind: 'measured',
      rows: [
        ['Files', (stats.total_files ?? 0).toLocaleString()],
        ['Folders', (stats.total_directories ?? 0).toLocaleString()],
        ['Deepest nesting', `${stats.max_depth ?? 0} levels`],
        ['Top languages', topLanguages],
        ['Skipped files', (stats.excluded_files ?? 0).toLocaleString()],
      ],
    },
    {
      title: 'Estimates',
      kind: 'estimate',
      rows: analytics?.estimated
        ? [
            ['Approx. source lines', `~${(analytics.estimated.approx_source_lines ?? 0).toLocaleString()}`],
            ['Source files counted', (analytics.estimated.analyzable_source_files ?? 0).toLocaleString()],
            ['Note', analytics.estimated.note || '—'],
          ]
        : [['Status', 'Not available. The backend did not return analytics.']],
    },
    {
      title: 'Architecture',
      kind: 'info',
      rows:
        architecture && Object.keys(architecture).length > 0
          ? [['Sections returned', Object.keys(architecture).join(', ')]]
          : [['Status', 'Not available. The backend did not return architecture data.']],
    },
  ]
}

function buildText(result, sections) {
  const lines = [`DevFlow report: ${result.repository.full_name}`, `Analyzed: ${formatDate(result.analyzed_at)}`, '']
  for (const section of sections) {
    lines.push(`${section.title.toUpperCase()} (${section.kind})`)
    for (const [label, value] of section.rows) lines.push(`- ${label}: ${value}`)
    lines.push('')
  }
  return lines.join('\n')
}

// Only send what the report needs (not the full file tree or README), so the request stays small.
function reportPayload(result) {
  const {
    repository,
    stats,
    language_stats,
    composition,
    top_level_directories,
    config_files,
    architecture,
    analytics,
    analyzed_at,
  } = result
  return {
    repository,
    stats,
    language_stats,
    composition,
    top_level_directories,
    config_files,
    architecture,
    analytics,
    analyzed_at,
  }
}

const EXPORTS = [
  { id: 'pdf', label: 'Download PDF' },
  { id: 'docx', label: 'Download Word' },
]

export default function ReportTab({ result }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(null) // 'pdf' | 'docx' | null
  const [exportError, setExportError] = useState('')
  const sections = buildSections(result)

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildText(result, sections))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function downloadReport(format) {
    setBusy(format)
    setExportError('')

    try {
      const response = await fetch(`${API_URL}/report/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload(result)),
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('The backend has no report endpoint yet. Add the /report routes to main.py and restart it.')
        }
        const data = await response.json().catch(() => ({}))
        throw new Error(typeof data.detail === 'string' ? data.detail : 'The report could not be generated.')
      }

      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `devflow-${result.repository.full_name.replace('/', '-')}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      setExportError(
        err instanceof TypeError
          ? `Cannot reach the DevFlow API at ${API_URL}. Make sure the backend is running.`
          : err.message
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0e1322] p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Analysis report</h2>
          <p className="mt-1 text-sm text-gray-400">
            {result.repository.full_name} · analyzed {formatDate(result.analyzed_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {EXPORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => downloadReport(item.id)}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="file" />
              {busy === item.id ? 'Generating…' : item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 transition hover:border-violet-400 hover:text-white"
          >
            <Icon name="copy" />
            {copied ? 'Copied!' : 'Copy as text'}
          </button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200"
        >
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p>{exportError}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Panel key={section.title} title={section.title} aside={<Badge kind={section.kind} />}>
            <dl className="divide-y divide-white/5 px-6">
              {section.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6 py-3 text-sm">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  <dd className="break-words text-right text-gray-200">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Measured values come straight from GitHub. Estimates are labelled as such. The downloadable reports use the
        same labels: Measured, Estimate and Heuristic.
      </p>
    </div>
  )
}