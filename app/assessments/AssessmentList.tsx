'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { AssessmentRow } from './page'

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-[#E6F1FB] text-[#0C447C]',
  MEDIUM: 'bg-[#EAF3DE] text-[#27500A]',
  HIGH: 'bg-[#FAEEDA] text-[#633806]',
  CRITICAL: 'bg-[#FCEBEB] text-[#791F1F]',
}

const TIERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-[#3B6D11]'
  if (score >= 50) return 'bg-[#BA7517]'
  return 'bg-[#A32D2D]'
}

interface Props {
  rows: AssessmentRow[]
  currentTier?: string
  page: number
  hasMore: boolean
  canModify: boolean
}

export default function AssessmentList({ rows, currentTier, page, hasMore, canModify }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function setTier(tier: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (tier) params.set('tier', tier)
    else params.delete('tier')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/assessments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        alert(body.error ?? 'Delete failed')
        return
      }
      setConfirmId(null)
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mr-1">Filter:</span>
        <button
          onClick={() => setTier(null)}
          className={`px-3 py-1 rounded-full text-[13px] font-medium border transition-colors ${
            !currentTier
              ? 'bg-[#5B3FD4] text-white border-[#5B3FD4]'
              : 'bg-white text-[#5B5478] border-[#E2DFF0] hover:bg-[#F9F8FD]'
          }`}
        >
          All
        </button>
        {TIERS.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-3 py-1 rounded-full text-[13px] font-medium border transition-colors ${
              currentTier === t
                ? 'bg-[#5B3FD4] text-white border-[#5B3FD4]'
                : 'bg-white text-[#5B5478] border-[#E2DFF0] hover:bg-[#F9F8FD]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2DFF0] p-12 text-center">
          <p className="text-[14px] text-[#8B85A8] mb-4">
            {currentTier ? `No ${currentTier} risk assessments found.` : 'No assessments yet.'}
          </p>
          <Link
            href="/assessments/new"
            className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
          >
            Start your first assessment
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2DFF0] overflow-hidden">
          <table className="min-w-full divide-y divide-[#E2DFF0]">
            <thead className="bg-[#F9F8FD]">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Vendor
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Risk tier
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Score
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Date assessed
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Assessed by
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Status
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DFF0]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-[#F9F8FD] transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="text-[14px] font-medium text-[#1A1625]">{row.vendorName}</div>
                    {row.companiesHouseNumber && (
                      <div className="text-[12px] text-[#B8B3CE] mt-0.5">CH: {row.companiesHouseNumber}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {row.riskTier ? (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium ${TIER_COLORS[row.riskTier] ?? 'bg-gray-100 text-gray-700'}`}>
                        {row.riskTier}
                      </span>
                    ) : (
                      <span className="text-[#B8B3CE] text-[13px]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {row.overallScore != null ? (
                      <div>
                        <span className="text-[14px] font-medium text-[#1A1625]">{row.overallScore}</span>
                        <div className="mt-1 h-[3px] w-16 bg-[#F9F8FD] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${scoreBarColor(row.overallScore)}`}
                            style={{ width: `${row.overallScore}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#B8B3CE] text-[13px]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-[13px] text-[#5B5478]">
                    {new Date(row.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-[13px] text-[#5B5478]">
                    {row.assessorName ?? '—'}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                      row.assessmentStatus === 'COMPLETE'
                        ? 'bg-[#EAF3DE] text-[#27500A]'
                        : 'bg-[#FAEEDA] text-[#633806]'
                    }`}>
                      {row.assessmentStatus}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-right text-sm">
                    {confirmId === row.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-[12px] text-[#5B5478]">Delete?</span>
                        <button
                          onClick={() => handleDelete(row.id)}
                          disabled={deleting}
                          className="text-[12px] font-medium text-[#791F1F] hover:text-red-800 disabled:opacity-50"
                        >
                          {deleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          disabled={deleting}
                          className="text-[12px] font-medium text-[#8B85A8] hover:text-[#5B5478]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-4">
                        <Link
                          href={`/assessments/${row.id}`}
                          className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
                        >
                          View
                        </Link>
                        {canModify && (
                          <button
                            onClick={() => setConfirmId(row.id)}
                            className="text-[#B8B3CE] hover:text-[#791F1F] transition-colors"
                            title="Delete assessment"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 text-[13px] font-medium text-[#5B3FD4] bg-white border border-[#E2DFF0] rounded-lg hover:bg-[#F9F8FD] disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-[13px] text-[#8B85A8]">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 text-[13px] font-medium text-[#5B3FD4] bg-white border border-[#E2DFF0] rounded-lg hover:bg-[#F9F8FD] disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
