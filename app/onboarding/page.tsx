import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import OnboardingFlow from './OnboardingFlow'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; token?: string }>
}) {
  const session = await getSession()
  if (!session?.user) {
    redirect('/api/auth/login?returnTo=/onboarding')
  }

  const { mode, token } = await searchParams
  const initialName: string = session.user.name ?? session.user.email ?? ''

  return (
    <OnboardingFlow
      initialName={initialName}
      initialMode={mode === 'join' ? 'join' : undefined}
      initialToken={token}
    />
  )
}
