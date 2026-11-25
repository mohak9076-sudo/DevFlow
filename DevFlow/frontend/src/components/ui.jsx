import Icon from './Icon'
import { formatNumber } from '../utils/format'

export function Panel({ title, aside, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[#0e1322] ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        {aside && <span className="text-xs text-gray-500">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function Stat({ icon, label, value }) {
  return (
    <div className="bg-[#0e1322] px-6 py-5">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon name={icon} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {value == null ? '—' : formatNumber(value)}
      </p>
    </div>
  )
}

// A segmented bar: each part's width is its share of the whole.
export function SegmentedBar({ segments, label }) {
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
      {segments.map((segment) => (
        <div
          key={segment.name}
          style={{ width: `${segment.percent}%`, backgroundColor: segment.color }}
          title={segment.name}
        />
      ))}
    </div>
  )
}

// A list of horizontal bars, each scaled against the biggest value.
export function BarList({ items, emptyText }) {
  if (items.length === 0) {
    return <p className="p-6 text-sm text-gray-500">{emptyText}</p>
  }

  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className="space-y-4 p-6">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate text-gray-200">
              {item.label}
              {item.hint && <span className="ml-2 font-mono text-xs text-gray-500">{item.hint}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-gray-400">{item.display}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color || '#8b5cf6' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}