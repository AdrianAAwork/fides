import React from 'react'

interface FidesFaviconProps {
  size?: number
}

export default function FidesFavicon({ size = 32 }: FidesFaviconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Filled background circle */}
      <circle cx="16" cy="16" r="15" fill="#5B3FD4"/>

      {/* F monogram in white */}
      <text fontFamily="Georgia,serif" fontSize="22" fontWeight="500"
        fill="#FFFFFF"
        textAnchor="middle"
        dominantBaseline="central"
        x="16" y="16.5">F</text>
    </svg>
  )
}
