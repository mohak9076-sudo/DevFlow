import { useState } from 'react'

// A small, dependency-free donut chart. Hover (or tab to) a legend row or a slice to focus it;
// the middle of the donut then shows that slice's name and share.

const RADIUS = 70
const STROKE = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 2 // small visual gap between slices

function shorten(text, max = 14) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export default function DonutChart({ segments, centerValue, centerLabel, label, emptyText = 'No data to chart.' }) {
  const [active, setActive] = useState(null)

  const visible = segments.filter((segment) => segment.value > 0)
  const total = visible.reduce((sum, segment) => sum + segment.value, 0)

  if (total <= 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>
  }

  let offset = 0
  const arcs = visible.map((segment) => {
    const fraction = segment.value / total
    const length = fraction * CIRCUMFERENCE
    const drawn = visible.length > 1 ? Math.max(length - GAP, 0.5) : length
    const arc = { ...segment, fraction, drawn, offset }
    offset += length
    return arc
  })

  const current = active != null ? arcs[active] : null

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0" role="img" aria-label={label}>
        <g transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={STROKE} />
          {arcs.map((arc, index) => (
            <circle
              key={`${arc.name}-${index}`}
              data-slice={arc.name}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={active === index ? STROKE + 4 : STROKE}
              strokeDasharray={`${arc.drawn} ${CIRCUMFERENCE - arc.drawn}`}
              strokeDashoffset={-arc.offset}
              opacity={active == null || active === index ? 1 : 0.3}
              style={{ transition: 'opacity 150ms, stroke-width 150ms' }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </g>
        <text x="100" y="97" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="600">
          {current ? `${(current.fraction * 100).toFixed(1)}%` : centerValue}
        </text>
        <text x="100" y="117" textAnchor="middle" fill="#9ca3af" fontSize="11">
          {current ? shorten(current.name) : centerLabel}
        </text>
      </svg>

      <ul className="w-full min-w-0 flex-1 space-y-1" onMouseLeave={() => setActive(null)}>
        {arcs.map((arc, index) => (
          <li
            key={`${arc.name}-${index}`}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400 ${
              active === index ? 'bg-white/5' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5 text-gray-200">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
              <span className="truncate">{arc.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-gray-500">
              {arc.display ? `${arc.display} · ` : ''}
              {(arc.fraction * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}