import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { API_URL, EXAMPLES, LANGUAGE_COLORS, OTHER_COLOR, categoryInfo, groupLanguages } from './utils/constants'
import { formatNumber, formatDate, timeAgo, formatSize, formatBytes } from './utils/format'
import { parseRepoInput, friendlyStatus } from './utils/github'
import Icon from './components/Icon'
import { Panel, Stat, BarList } from './components/ui'
import DonutChart from './components/DonutChart'
import EmptyState from './components/EmptyState'
import AnalyticsPanel from './components/AnalyticsPanel'
import ArchitecturePanel from './components/ArchitecturePanel'
import ReportTab from './components/ReportTab'
import ChatWidget from './components/ChatWidget'
import AuthScreen from './components/AuthScreen'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'architecture', label: 'Architecture', icon: 'layers' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'report', label: 'Report', icon: 'files' },
]

function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return null
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

function readStoredSession() {
  for (const store of [localStorage, sessionStorage]) {
    const token = store.getItem('devflow_token')
    const rawUser = store.getItem('devflow_user')
    if (token && rawUser) {
      try {
        return { token, user: JSON.parse(rawUser) }
      } catch {
        store.removeItem('devflow_token')
        store.removeItem('devflow_user')
      }
    }
  }
  return { token: null, user: null }
}

/* ---------- Result panels ---------- */

function RepoHeader({ repo, stats }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1322]">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
        {repo.avatar_url && (
          <img src={repo.avatar_url} alt="" className="h-14 w-14 rounded-xl border border-white/10" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate text-2xl font-semibold text-white">{repo.full_name}</h2>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs capitalize text-gray-300">
              {repo.visibility}
            </span>
            {repo.archived && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-300">
                Archived
              </span>
            )}
          </div>

          <p className="mt-2 max-w-2xl text-gray-400">{repo.description || 'No description provided.'}</p>

          {repo.primary_language && (
            <p className="mt-3 flex items-center gap-2 text-sm text-gray-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: LANGUAGE_COLORS[repo.primary_language] || OTHER_COLOR }}
              />
              {repo.primary_language}
            </p>
          )}

          {repo.topics?.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {repo.topics.slice(0, 8).map((topic) => (
                <li key={topic} className="rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
                  {topic}
                </li>
              ))}
            </ul>
          )}
        </div>

        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 transition hover:border-violet-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
        >
          View on GitHub
          <Icon name="external" />
        </a>
      </div>

      {/* gap-px on a tinted background draws thin dividers that survive any wrapping */}
      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon="star" label="Stars" value={repo.stars} />
        <Stat icon="fork" label="Forks" value={repo.forks} />
        <Stat icon="issue" label="Open issues" value={repo.open_issues} />
        <Stat icon="eye" label="Watchers" value={repo.watchers} />
        <Stat icon="users" label="Contributors" value={repo.contributors} />
        <Stat icon="files" label="Files analysed" value={stats.total_files} />
      </div>
    </section>
  )
}

function LanguagePanel({ languageStats }) {
  const groups = groupLanguages(languageStats)

  return (
    <Panel title="Languages" aside={languageStats.length > 0 ? `${languageStats.length} detected` : undefined}>
      <div className="p-6">
        <DonutChart
          segments={groups.map((group) => ({ name: group.name, value: group.percent, color: group.color }))}
          centerValue={String(languageStats.length)}
          centerLabel={languageStats.length === 1 ? 'language' : 'languages'}
          label={`Language breakdown: ${groups.map((g) => `${g.name} ${g.percent.toFixed(1)}%`).join(', ')}`}
          emptyText="GitHub has no language data for this repository."
        />
      </div>
    </Panel>
  )
}

function CompositionPanel({ composition, stats, treeTruncated }) {
  const [mode, setMode] = useState('files') // 'files' | 'size'

  const totalFiles = composition.reduce((sum, item) => sum + item.count, 0)
  const totalBytes = composition.reduce((sum, item) => sum + (item.size_bytes || 0), 0)

  const segments = composition.map((item) => ({
    name: categoryInfo(item.category).label,
    color: categoryInfo(item.category).color,
    value: mode === 'files' ? item.count : item.size_bytes || 0,
    display: mode === 'files' ? `${item.count.toLocaleString()} files` : formatBytes(item.size_bytes),
  }))

  return (
    <Panel title="Repository composition" aside={`${formatNumber(totalFiles)} files`}>
      <div className="p-6">
        <div className="mb-5 inline-flex rounded-lg border border-white/10 p-0.5 text-xs" role="group" aria-label="Chart by">
          {[
            ['files', 'By file count'],
            ['size', 'By size'],
          ].map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <DonutChart
          segments={segments}
          centerValue={mode === 'files' ? formatNumber(totalFiles) : formatBytes(totalBytes)}
          centerLabel={mode === 'files' ? 'files' : 'total size'}
          label={`Composition by ${mode === 'files' ? 'file count' : 'size'}: ${segments.map((s) => s.name).join(', ')}`}
          emptyText={composition.length === 0 ? 'No files found in this repository.' : 'No size data for this view.'}
        />

        {(stats.excluded_files > 0 || treeTruncated) && (
          <div className="mt-6 space-y-1 border-t border-white/10 pt-4 text-xs text-gray-500">
            {stats.excluded_files > 0 && (
              <p>
                {stats.excluded_files.toLocaleString()} files inside generated folders (such as node_modules, venv or
                dist) were skipped.
              </p>
            )}
            {treeTruncated && <p>This repository is very large, so the file list was shortened.</p>}
          </div>
        )}
      </div>
    </Panel>
  )
}

function DetailsPanel({ repo, stats }) {
  const rows = [
    ['Visibility', repo.visibility ? repo.visibility[0].toUpperCase() + repo.visibility.slice(1) : '—'],
    ['Primary language', repo.primary_language || '—'],
    ['Default branch', repo.default_branch],
    ['License', repo.license || 'Not specified'],
    ['Created', formatDate(repo.created_at)],
    ['Last updated', formatDate(repo.updated_at)],
    ['Last push', timeAgo(repo.pushed_at)],
    ['Repository size', formatSize(repo.size_kb)],
    ['Folders', stats.total_directories.toLocaleString()],
    ['Deepest nesting', `${stats.max_depth} levels`],
  ]

  return (
    <Panel title="Details">
      <dl className="divide-y divide-white/5 px-6">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-3 text-sm">
            <dt className="text-gray-500">{label}</dt>
            <dd className="flex items-center gap-2 text-gray-200">
              {label === 'Default branch' && <Icon name="branch" className="h-3.5 w-3.5 text-gray-500" />}
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

function FileTypesPanel({ fileTypes }) {
  const items = fileTypes.slice(0, 8).map((type) => ({
    key: type.extension,
    label: type.label,
    hint: type.extension === 'other' ? '' : type.extension,
    value: type.count,
    display: `${type.count.toLocaleString()} files`,
    color: categoryInfo(type.category).color,
  }))

  return (
    <Panel title="File types">
      <BarList items={items} emptyText="No files found." />
    </Panel>
  )
}

function FoldersPanel({ folders }) {
  const items = folders.slice(0, 8).map((folder) => ({
    key: folder.name,
    label: folder.name,
    value: folder.file_count,
    display: `${folder.file_count.toLocaleString()} files · ${formatBytes(folder.size_bytes)}`,
  }))

  return (
    <Panel title="Where the files live" aside="Top-level folders">
      <BarList items={items} emptyText="No folders found." />
    </Panel>
  )
}

function FilesPanel({ files }) {
  return (
    <Panel title="Root files" aside={`${files.length} items`}>
      {files.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">This repository has no files in its root folder.</p>
      ) : (
        <ul className="max-h-[28rem] overflow-y-auto py-2">
          {files.map((item) => {
            const isFolder = item.type === 'dir'
            const row = (
              <>
                <Icon
                  name={isFolder ? 'folder' : 'file'}
                  className={`h-4 w-4 ${isFolder ? 'text-violet-400' : 'text-gray-600'}`}
                />
                <span className="truncate font-mono text-[13px]">{item.name}</span>
              </>
            )
            const rowClass = 'flex items-center gap-3 px-6 py-2 text-gray-300'

            return (
              <li key={item.name}>
                {item.html_url ? (
                  <a
                    href={item.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`${rowClass} transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-400`}
                  >
                    {row}
                  </a>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function ConfigFilesPanel({ configFiles }) {
  const visible = configFiles.slice(0, 12)
  const hidden = configFiles.length - visible.length

  return (
    <Panel title="Configuration files" aside={`${configFiles.length} detected`}>
      {configFiles.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">No well-known configuration files were found.</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-white/5 overflow-y-auto">
          {visible.map((file) => (
            <li key={file.path} className="flex items-start justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] text-gray-200">{file.path}</p>
                <p className="mt-0.5 text-xs text-gray-500">{file.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-xs capitalize text-gray-400">
                {file.category}
              </span>
            </li>
          ))}
          {hidden > 0 && <li className="px-6 py-3 text-xs text-gray-500">+ {hidden} more</li>}
        </ul>
      )}
    </Panel>
  )
}

function ReadmePanel({ readme }) {
  return (
    <Panel title="README" aside={readme?.name}>
      {!readme || !readme.content ? (
        <p className="p-6 text-sm text-gray-500">No README text is available for this repository.</p>
      ) : (
        <div className="p-6">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-300">
            {readme.content}
          </pre>
          {readme.truncated && (
            <p className="mt-4 text-xs text-gray-500">Only the first part of the README is shown.</p>
          )}
        </div>
      )}
    </Panel>
  )
}

function LoadingSkeleton() {
  return (
    <div className="mt-10 animate-pulse space-y-6" aria-hidden="true">
      <div className="h-56 rounded-2xl border border-white/10 bg-[#0e1322]" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="h-64 rounded-2xl border border-white/10 bg-[#0e1322] lg:col-span-3" />
        <div className="h-64 rounded-2xl border border-white/10 bg-[#0e1322] lg:col-span-2" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-48 rounded-2xl border border-white/10 bg-[#0e1322]" />
        <div className="h-48 rounded-2xl border border-white/10 bg-[#0e1322]" />
      </div>
    </div>
  )
}

/* ---------- Tab navigation (sits beside the DevFlow title) ---------- */

function TabNav({ active, onChange, disabled }) {
  return (
    <nav aria-label="Dashboard sections" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const selected = tab.id === active && !disabled
        return (
          <button
            key={tab.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            aria-current={selected ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'border-violet-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white disabled:hover:text-gray-400'
            }`}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}

/* ---------- Architecture and analytics ---------- */

async function withInsights(data, signal) {
  if (data.architecture && data.analytics) return { data, note: '' }

  try {
    const response = await fetch(`${API_URL}/analyze/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    })

    if (response.status === 404) {
      return {
        data,
        note: 'The backend has no /analyze/insights endpoint yet, so Architecture and Analytics are empty. Add the new routes to main.py and restart the backend.',
      }
    }

    const insights = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        data,
        note: typeof insights.detail === 'string' ? insights.detail : 'Architecture and analytics could not be generated.',
      }
    }

    return {
      data: {
        ...data,
        architecture: data.architecture ?? insights.architecture ?? null,
        analytics: data.analytics ?? insights.analytics ?? null,
      },
      note: insights.errors?.length ? `Part of the analysis failed: ${insights.errors.join('; ')}` : '',
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err
    return { data, note: 'Architecture and analytics could not be generated.' }
  }
}

function Notice({ children }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200"
    >
      <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
      <p>{children}</p>
    </div>
  )
}

/* ---------- Main app ---------- */

function App() {
  const [repoUrl, setRepoUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [insightsNote, setInsightsNote] = useState('')

  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  const controllerRef = useRef(null)

  // Cancel any request still running if the page is closed.
  useEffect(() => () => controllerRef.current?.abort(), [])

  // Restore saved session or handle GitHub OAuth callback (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')

    if (urlToken) {
      const payload = parseJwtPayload(urlToken)
      const ghUser = payload
        ? {
            username: payload.username,
            email: payload.email,
            avatar_url: payload.avatar_url,
            provider: payload.provider || 'github',
          }
        : { username: 'GitHub User' }

      localStorage.setItem('devflow_token', urlToken)
      localStorage.setItem('devflow_user', JSON.stringify(ghUser))
      setToken(urlToken)
      setUser(ghUser)

      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    const saved = readStoredSession()
    if (saved.token && saved.user) {
      setToken(saved.token)
      setUser(saved.user)
    }
  }, [])

  function handleAuthSuccess(loggedInUser, accessToken) {
    setUser(loggedInUser)
    setToken(accessToken)
    setIsAuthOpen(false)
  }

  function handleLogout() {
    localStorage.removeItem('devflow_token')
    localStorage.removeItem('devflow_user')
    sessionStorage.removeItem('devflow_token')
    sessionStorage.removeItem('devflow_user')
    setToken(null)
    setUser(null)
  }

  async function analyze(rawInput) {
    const parsed = parseRepoInput(rawInput)

    if (parsed.error) {
      setStatus('error')
      setError(parsed.error)
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setRepoUrl(parsed.url)
    setStatus('loading')
    setError('')
    setInsightsNote('')

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: parsed.url }),
        signal: controller.signal,
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : ''
        throw new Error(detail || friendlyStatus(response.status))
      }

      const { data: enriched, note } = await withInsights(data, controller.signal)

      setResult(enriched)
      setInsightsNote(note)
      setActiveTab('overview')
      setStatus('success')
    } catch (err) {
      if (err.name === 'AbortError') return
      setResult(null)
      setStatus('error')
      setError(
        err instanceof TypeError
          ? `Cannot reach the DevFlow API at ${API_URL}. Make sure the backend is running.`
          : err.message
      )
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    analyze(repoUrl)
  }

  function analyzeExample(path) {
    setRepoUrl(path)
    analyze(path)
  }

  const isLoading = status === 'loading'
  const hasResult = status === 'success' && result

  return (
    <div className="min-h-screen bg-[#080b16] text-gray-100 antialiased">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080b16]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-8">
            <div className="flex items-center gap-3 py-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Icon name="branch" className="h-4 w-4" />
              </span>
              <span className="text-lg font-bold text-white">DevFlow</span>
            </div>

            <TabNav active={activeTab} onChange={setActiveTab} disabled={!hasResult} />
          </div>

          <div className="py-2.5">
            {user ? (
              <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] py-1 pl-1.5 pr-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="h-7 w-7 rounded-full border border-violet-400/40 object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                    {(user.username || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-200">{user.username}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Log out"
                  className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] transition hover:brightness-110"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-6xl px-6 pb-28 ${hasResult ? 'pt-8' : 'pt-16'}`}>
        {!hasResult && (
          <>
            <h1 className="max-w-2xl text-4xl font-bold leading-tight text-white sm:text-5xl">
              Understand any GitHub repository at a glance.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-gray-400">
              Paste a repository link to see its languages, structure and activity.
            </p>
          </>
        )}

        <form onSubmit={handleSubmit} className={`flex flex-col gap-3 sm:flex-row ${hasResult ? '' : 'mt-10'}`}>
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository  (or just owner/repository)"
              aria-label="GitHub repository URL"
              aria-invalid={status === 'error'}
              className="w-full rounded-xl border border-gray-700 bg-[#151a2b] py-4 pl-12 pr-4 text-white outline-none transition placeholder:text-gray-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-8 py-4 font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
            )}
            {isLoading ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>Try:</span>
          {EXAMPLES.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => analyzeExample(path)}
              disabled={isLoading}
              className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-gray-300 transition hover:border-violet-400 hover:text-white disabled:opacity-50"
            >
              {path}
            </button>
          ))}
        </div>

        {status === 'error' && (
          <div
            role="alert"
            className="mt-8 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200"
          >
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p>{error}</p>
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {status === 'idle' && <EmptyState />}

        {hasResult && (
          <div className="mt-8 space-y-6">
            {activeTab === 'overview' && (
              <>
                <RepoHeader repo={result.repository} stats={result.stats} />

                <div className="grid gap-6 lg:grid-cols-5">
                  <div className="space-y-6 lg:col-span-3">
                    <LanguagePanel languageStats={result.language_stats} />
                    <CompositionPanel
                      composition={result.composition}
                      stats={result.stats}
                      treeTruncated={result.tree_truncated}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <DetailsPanel repo={result.repository} stats={result.stats} />
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <FileTypesPanel fileTypes={result.file_types} />
                  <FoldersPanel folders={result.top_level_directories} />
                </div>
              </>
            )}

            {activeTab === 'architecture' && (
              <>
                {insightsNote && <Notice>{insightsNote}</Notice>}
                <ArchitecturePanel analysis={result} architecture={result.architecture} />
              </>
            )}

            {activeTab === 'analytics' && (
              <>
                {insightsNote && <Notice>{insightsNote}</Notice>}
                <AnalyticsPanel analytics={result.analytics} />
              </>
            )}

            {activeTab === 'files' && (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <FilesPanel files={result.files} />
                  <ConfigFilesPanel configFiles={result.config_files} />
                </div>
                <ReadmePanel readme={result.readme} />
              </>
            )}

            {activeTab === 'report' && <ReportTab result={result} />}
          </div>
        )}
      </main>

      <AuthScreen
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* key resets the chat when a different repository is analyzed, so conversations never mix */}
      <ChatWidget key={result?.repository?.full_name ?? 'none'} result={result} />
    </div>
  )
}

export default App