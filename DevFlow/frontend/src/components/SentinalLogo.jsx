import React from 'react'

export default function SentinalLogo({ className = 'h-6 w-6' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`${className} group`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sentinalGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" /> {/* Violet-500 */}
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" /> {/* Indigo-500 */}
        </linearGradient>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Geometric S shape */}
      <path
        d="M 60 10 C 30 10, 10 30, 10 60 S 90 90, 90 60 L 90 45 S 90 30, 75 30"
        fill="none"
        stroke="url(#sentinalGlow)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-80 group-hover:opacity-100 transition-opacity duration-300"
        filter="url(#softGlow)"
      />
      {/* Central Sparkle */}
      <path
        d="M 60 52 L 60 68 M 52 60 L 68 60"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        filter="url(#softGlow)"
      />
    </svg>
  )
}