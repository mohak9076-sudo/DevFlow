// Where the FastAPI backend lives. Change it with a VITE_API_URL variable later (e.g. for deployment).
export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export const EXAMPLES = ['tiangolo/fastapi', 'vitejs/vite', 'facebook/react']

// Same colours GitHub uses, so the language bar feels familiar.
export const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  Java: '#b07219',
  HTML: '#e34c26',
  CSS: '#7c5cd6',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Go: '#00add8',
  Rust: '#dea584',
  C: '#8a8a8a',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#cc342d',
  PHP: '#4f5d95',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  Dockerfile: '#384d54',
  'Jupyter Notebook': '#da5b0b',
  Vue: '#41b883',
}
export const OTHER_COLOR = '#64748b'

// How the backend groups files, with a label and colour for each group.
export const CATEGORIES = {
  source: { label: 'Source code', color: '#8b5cf6' },
  tests: { label: 'Tests', color: '#34d399' },
  config: { label: 'Configuration', color: '#38bdf8' },
  docs: { label: 'Documentation', color: '#fbbf24' },
  assets: { label: 'Assets', color: '#f472b6' },
  other: { label: 'Other', color: '#64748b' },
}

export function categoryInfo(category) {
  return CATEGORIES[category] || CATEGORIES.other
}

// The backend sends every language; show the biggest 7 and group the rest as "Other".
export function groupLanguages(languageStats) {
  const top = languageStats.slice(0, 7).map((item) => ({
    name: item.name,
    percent: item.percent,
    color: LANGUAGE_COLORS[item.name] || OTHER_COLOR,
  }))
  const rest = languageStats.slice(7)
  if (rest.length > 0) {
    top.push({ name: 'Other', percent: rest.reduce((sum, item) => sum + item.percent, 0), color: OTHER_COLOR })
  }
  return top
}