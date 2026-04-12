'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  assessmentId: string
  vendorName: string
}

export default function AssessmentActions({ assessmentId, vendorName }: Props) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        alert(body.error ?? 'Delete failed')
        return
      }
      router.push('/assessments')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <a
        href={`/assessments/${assessmentId}/regenerate`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Re-run assessment
      </a>

      {!showDeleteConfirm ? (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:text-red-600 hover:border-red-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5">
          <span className="text-xs text-red-700">
            Delete assessment for <span className="font-medium">{vendorName}</span>? This cannot be undone.
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            disabled={deleting}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
