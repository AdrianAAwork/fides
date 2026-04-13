import React from 'react'

interface FidesSealProps {
  size?: number
}

export default function FidesSeal({ size = 60 }: FidesSealProps) {
  const id = React.useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="70" cy="70" r="64" fill="none"
        stroke="#5B3FD4" strokeWidth="1.5" opacity="0.45"/>
      <circle cx="70" cy="70" r="48" fill="none"
        stroke="#5B3FD4" strokeWidth="1" opacity="0.3"/>
      <path id={`top-${id}`}
        d="M 70,70 m -56,0 a 56,56 0 0,1 112,0" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="8"
        fill="#5B3FD4" fillOpacity="0.72" letterSpacing="2">
        <textPath
          href={`#top-${id}`}
          startOffset="50%"
          textAnchor="middle"
          dy="-8"
        >
          VENDOR ASSESSMENT
        </textPath>
      </text>
      <path id={`bot-${id}`}
        d="M 70,70 m -56,0 a 56,56 0 0,0 112,0" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="8"
        fill="#5B3FD4" fillOpacity="0.58" letterSpacing="2">
        <textPath
          href={`#bot-${id}`}
          startOffset="50%"
          textAnchor="middle"
          dy="16"
        >
          RISK MANAGEMENT
        </textPath>
      </text>
      <text fontFamily="Inter,sans-serif" fontSize="7"
        fill="#5B3FD4" fillOpacity="0.6"
        textAnchor="middle" x="14" y="73">✦</text>
      <text fontFamily="Inter,sans-serif" fontSize="7"
        fill="#5B3FD4" fillOpacity="0.6"
        textAnchor="middle" x="126" y="73">✦</text>
      <text fontFamily="Georgia,serif" fontSize="30"
        fill="#5B3FD4" fillOpacity="0.72"
        textAnchor="middle" x="70" y="65">F</text>
      <text fontFamily="Inter,sans-serif" fontSize="8.5"
        fill="#5B3FD4" fillOpacity="0.4"
        textAnchor="middle" x="70" y="80"
        letterSpacing="5">FIDES</text>
    </svg>
  )
}
