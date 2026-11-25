import Icon from './Icon'

const FEATURES = [
  {
    icon: 'chart',
    title: 'Languages and composition',
    text: 'Interactive charts of the languages used and how the files split into source, tests, docs and config.',
  },
  {
    icon: 'layers',
    title: 'Architecture insights',
    text: 'Frameworks, entry points and folder roles, clearly marked as heuristic guesses rather than facts.',
  },
  {
    icon: 'files',
    title: 'Downloadable report',
    text: 'Export the analysis as a PDF or Word file, with measured data and estimates labelled separately.',
  },
  {
    icon: 'chat',
    title: 'Ask about the repo',
    text: 'The chat window is in place. Answers from an AI assistant are coming in a later phase.',
  },
]

export default function EmptyState() {
  return (
    <section className="mt-14" aria-label="What DevFlow shows">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">What you get</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="rounded-2xl border border-white/10 bg-[#0e1322] p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Icon name={feature.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-white">{feature.title}</h3>
            <p className="mt-1 text-sm text-gray-400">{feature.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}