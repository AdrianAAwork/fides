'use client'

import { useState } from 'react'
import { regulatoryReferences } from '@/src/lib/regulatoryReferences'
import type { RegulatoryReference } from '@/src/lib/regulatoryReferences'

export default function RegulatoryPanel() {
  const [open, setOpen] = useState<RegulatoryReference | null>(null)

  return (
    <>
      <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
        <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-4">Regulatory references</p>
        <div className="divide-y divide-[#E2DFF0]">
          {regulatoryReferences.map((ref) => (
            <div key={ref.id} className="py-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[#5B3FD4] bg-[#EEEDFE] px-2 py-0.5 rounded-full whitespace-nowrap">
                    {ref.article}
                  </span>
                  <span className="text-[12px] text-[#B8B3CE]">{ref.regulator}</span>
                </div>
                <p className="text-[14px] font-medium text-[#1A1625] mt-1">{ref.title}</p>
                <p className="text-[13px] text-[#5B5478] mt-0.5">{ref.description}</p>
              </div>
              <button
                onClick={() => setOpen(ref)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-[#E2DFF0] text-[13px] text-[#5B3FD4] font-medium hover:bg-[#F9F8FD] transition-colors"
              >
                View article
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over panel */}
      {open && (
        <div
          className="absolute right-0 top-0 h-full w-[480px] bg-white border-l border-[#E2DFF0] shadow-lg z-10 flex flex-col"
          style={{ minHeight: '100%' }}
        >
          <div className="flex items-start justify-between px-6 py-5 border-b border-[#E2DFF0] flex-shrink-0">
            <div>
              <span className="text-[12px] font-medium text-[#5B3FD4] bg-[#EEEDFE] px-2 py-0.5 rounded-full">
                {open.article}
              </span>
              <h3 className="text-[15px] font-medium text-[#1A1625] mt-2">{open.title}</h3>
              <p className="text-[13px] text-[#5B5478] mt-1">{open.description}</p>
            </div>
            <button
              onClick={() => setOpen(null)}
              className="ml-4 flex-shrink-0 text-[#B8B3CE] hover:text-[#5B5478] transition-colors mt-0.5"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="text-[13px] text-[#5B5478] whitespace-pre-wrap leading-relaxed font-sans">
              {open.fullText}
            </pre>
          </div>

          <div className="px-6 py-4 border-t border-[#E2DFF0] flex-shrink-0">
            <a
              href={open.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
            >
              Open on {open.regulator} ↗
            </a>
          </div>
        </div>
      )}
    </>
  )
}
