import React from 'react'

interface FidesSealMonoProps {
  size?: number
}

export default function FidesSealMono({ size = 60 }: FidesSealMonoProps) {
  const id = React.useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer border */}
      <circle cx="70" cy="70" r="64" fill="none"
        stroke="#FFFFFF" strokeWidth="1.5" opacity="0.55"/>

      {/* Inner border */}
      <circle cx="70" cy="70" r="48" fill="none"
        stroke="#FFFFFF" strokeWidth="1" opacity="0.4"/>

      {/* Top text path — radius 52, hugs the inner ring */}
      <path id={`top-${id}`}
        d="M 18,70 A 52,52 0 0 1 122,70" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="7"
        fill="#FFFFFF" fillOpacity="0.85" letterSpacing="3">
        <textPath
          href={`#top-${id}`}
          startOffset="50%"
          textAnchor="middle"
        >
          VENDOR ASSESSMENT
        </textPath>
      </text>

      {/* Bottom text path — radius 56, sits in the middle band */}
      <path id={`bot-${id}`}
        d="M 14,70 A 56,56 0 0 0 126,70" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="7"
        fill="#FFFFFF" fillOpacity="0.7" letterSpacing="3">
        <textPath
          href={`#bot-${id}`}
          startOffset="50%"
          textAnchor="middle"
          {...{"side": "right"} as object}
        >
          RISK MANAGEMENT
        </textPath>
      </text>

      {/* Left ornament */}
      <text fontFamily="Inter,sans-serif" fontSize="8"
        fill="#FFFFFF" fillOpacity="0.7"
        textAnchor="middle"
        dominantBaseline="central"
        x="14" y="70">✦</text>

      {/* Right ornament */}
      <text fontFamily="Inter,sans-serif" fontSize="8"
        fill="#FFFFFF" fillOpacity="0.7"
        textAnchor="middle"
        dominantBaseline="central"
        x="126" y="70">✦</text>

      {/* Centre F monogram */}
      <text fontFamily="Georgia,serif" fontSize="44"
        fill="#FFFFFF" fillOpacity="0.95"
        textAnchor="middle"
        dominantBaseline="central"
        x="70" y="70">F</text>
    </svg>
  )
}
