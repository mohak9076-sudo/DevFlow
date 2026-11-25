import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../utils/constants'
import Icon from './Icon'
import SentinalLogo from './SentinalLogo'

const STARTER_PROMPTS = [
  'What does this project do?',
  'Can this be used in a Java capstone for representation?',
  'Show screenshots from this repository',
  'How would you explain this architecture in a demo?',
  'What are its main strengths and improvements needed?',
]

function buildGreeting(result) {
  const repoName = result?.repository?.full_name
  if (repoName) {
    return `Hi! I'm **Sentinal**, your DevFlow engineering assistant. I have **${repoName}** loaded—ask me anything about its structure, stack, screenshots, trade-offs, or capstone/presentation fit.`
  }
  return `Hi! I'm **Sentinal**, your DevFlow engineering assistant. Analyze a repository first, or ask me general architecture, stack, and capstone/project representation questions.`
}

function renderFormattedText(text = '') {
  return text.split('\n').map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <p key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={i} className="font-semibold text-white">
                {part.slice(2, -2)}
              </strong>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </p>
    )
  })
}

export default function ChatWidget({ result }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState(() => [
    { id: 'greeting', role: 'assistant', content: buildGreeting(result), images: [] },
  ])

  const bottomRef = useRef(null)
  const repoName = result?.repository?.full_name

  useEffect(() => {
    setMessages([{ id: 'greeting', role: 'assistant', content: buildGreeting(result), images: [] }])
  }, [repoName])

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, sending])

  async function sendMessage(messageText) {
    const cleanMessage = (messageText ?? input).trim()
    if (!cleanMessage || sending) return

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: cleanMessage, images: [] }
    const nextHistory = [...messages, userMsg]

    setMessages(nextHistory)
    setInput('')
    setSending(true)

    try {
      const compactContext = result
        ? {
            repository: result.repository,
            stats: result.stats,
            language_stats: result.language_stats,
            composition: result.composition,
            top_level_directories: result.top_level_directories,
            config_files: result.config_files,
            files: Array.isArray(result.files) ? result.files.slice(0, 120) : [],
            tree: Array.isArray(result.tree) ? result.tree.slice(0, 120) : [],
            readme_excerpt: result.readme?.content ? result.readme.content.slice(0, 4000) : '',
            architecture: result.architecture,
            analytics: result.analytics,
          }
        : null

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanMessage,
          question: cleanMessage,
          repo_context: compactContext,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errText =
          typeof data.detail === 'string'
            ? data.detail
            : 'Sentinal could not process that request right now.'
        throw new Error(errText)
      }

      const reply =
        data.reply ||
        data.answer ||
        data.message ||
        'I received your question, but no response text was returned.'
      const images = Array.isArray(data.images) ? data.images : []

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: reply, images },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `**Connection / Config Issue:** ${err.message}`,
          images: [],
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <section
          aria-label="Sentinal AI Assistant"
          className="mb-3 flex h-[32rem] w-[22rem] sm:w-[25rem] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c1120] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#11182c] px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <SentinalLogo className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">Sentinal</h3>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                    AI
                  </span>
                </div>
                <p className="truncate text-[11px] text-gray-400">
                  {repoName || 'No repository loaded'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Sentinal chat"
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      isUser
                        ? 'bg-violet-600 text-white rounded-br-sm'
                        : 'border border-white/10 bg-[#151c30] text-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {renderFormattedText(msg.content)}

                    {!isUser && Array.isArray(msg.images) && msg.images.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {msg.images.map((img) => (
                          <figure
                            key={img.url}
                            className="overflow-hidden rounded-lg border border-white/10 bg-[#090d18]"
                          >
                            <img
                              src={img.url}
                              alt={img.name || img.path}
                              loading="lazy"
                              className="max-h-44 w-full object-cover"
                            />
                            <figcaption className="truncate px-2.5 py-1 font-mono text-[10px] text-gray-400">
                              {img.path}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-[#151c30] px-3.5 py-2.5 text-xs text-gray-400">
                  Sentinal is thinking…
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Starter Prompts */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-[#0a0f1c] px-3 py-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => sendMessage(prompt)}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition hover:border-violet-400 hover:text-white disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 bg-[#11182c] p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sentinal about this repo, screenshots, or capstone fit..."
              disabled={sending}
              className="flex-1 rounded-xl border border-white/10 bg-[#090d18] px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-violet-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message to Sentinal"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </section>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Minimize Sentinal' : 'Open Sentinal AI Assistant'}
        className="ml-auto flex h-13 w-13 items-center justify-center rounded-full bg-violet-600 text-white shadow-xl transition hover:scale-105 hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
      >
        {open ? '✕' : <Icon name="sparkles" className="h-5 w-5" />}
      </button>
    </div>
  )
}