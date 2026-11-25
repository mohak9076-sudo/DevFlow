import { Panel, BarList } from './ui'
import { formatNumber, formatBytes, formatDate } from '../utils/format'

function Badge({ kind }) {
  const styles =
    kind === 'measured'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles}`}>
      {kind === 'measured' ? 'Measured' : 'Estimate'}
    </span>
  )
}

function Metric({ label, value }) {
  return (
    <div className="bg-[#0e1322] px-6 py-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  )
}

export default function AnalyticsPanel({ analytics }) {
  if (!analytics) {
    return (
      <Panel title="Technical analytics">
        <p className="p-6 text-sm text-gray-500">
          The backend did not return analytics for this repository. Restart the backend and analyze again.
        </p>
      </Panel>
    )
  }

  const measured = analytics.measured ?? {}
  const estimated = analytics.estimated ?? {}
  const activity = analytics.activity

  const largestFiles = (measured.largest_files ?? []).slice(0, 8).map((file) => ({
    key: file.path,
    label: file.path,
    value: file.size_bytes,
    display: formatBytes(file.size_bytes),
  }))

  return (
    <div className="space-y-6">
      <Panel title="Technical analytics" aside={<Badge kind="measured" />}>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-5">
          <Metric label="Files" value={formatNumber(measured.total_files)} />
          <Metric label="Directories" value={formatNumber(measured.total_directories)} />
          <Metric label="Total size" value={formatBytes(measured.total_size_bytes)} />
          <Metric label="Max depth" value={measured.max_depth ?? '—'} />
          <Metric label="Skipped files" value={formatNumber(measured.excluded_files)} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Largest files" aside={<Badge kind="measured" />}>
          <BarList items={largestFiles} emptyText="No file size data available." />
        </Panel>

        <div className="space-y-6">
          <Panel title="Estimated size" aside={<Badge kind="estimate" />}>
            <div className="p-6">
              <p className="text-3xl font-semibold tabular-nums text-white">
                ~{formatNumber(estimated.approx_source_lines)}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                lines of source code across {formatNumber(estimated.analyzable_source_files)} files
              </p>
              {estimated.note && <p className="mt-4 text-xs text-gray-500">{estimated.note}</p>}
            </div>
          </Panel>

          <Panel title="Recent activity" aside={<Badge kind="measured" />}>
            {activity ? (
              <dl className="divide-y divide-white/5 px-6 text-sm">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-gray-500">Commits checked</dt>
                  <dd className="text-gray-200">{activity.recent_commits}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-gray-500">Latest commit</dt>
                  <dd className="truncate text-gray-200">{activity.latest_commit_message || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-gray-500">Date</dt>
                  <dd className="text-gray-200">{formatDate(activity.latest_commit_date)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-gray-500">Authors</dt>
                  <dd className="text-gray-200">{activity.authors?.length ?? 0}</dd>
                </div>
              </dl>
            ) : (
              <p className="p-6 text-sm text-gray-500">No commit activity available.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}