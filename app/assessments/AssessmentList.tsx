'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { AssessmentRow } from './page'

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

const TIERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

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

  // id of the row currently showing the delete confirmation
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
        <span className="text-sm text-gray-500">Filter:</span>
        <button
          onClick={() => setTier(null)}
          className={`px-3 py-1 rounded-full text-sm font-medium border ${
            !currentTier ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {TIERS.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${
              currentTier === t
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 mb-4">
            {currentTier ? `No ${currentTier} risk assessments found.` : 'No assessments yet.'}
          </p>
          <Link
            href="/assessments/new"
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Start your first assessment
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date assessed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assessed by
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{row.vendorName}</div>
                    {row.companiesHouseNumber && (
                      <div className="text-xs text-gray-400">CH: {row.companiesHouseNumber}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {row.riskTier ? (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          TIER_COLORS[row.riskTier] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {row.riskTier}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.overallScore != null ? row.overallScore : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(row.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.assessorName ?? '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        row.assessmentStatus === 'COMPLETE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {row.assessmentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {confirmId === row.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-600">Delete?</span>
                        <button
                          onClick={() => handleDelete(row.id)}
                          disabled={deleting}
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {deleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          disabled={deleting}
                          className="text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-4">
                        <Link
                          href={`/assessments/${row.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View
                        </Link>
                        {canModify && (
                          <button
                            onClick={() => setConfirmId(row.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
