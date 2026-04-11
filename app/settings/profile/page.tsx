import { redirect } from 'next/navigation'
import { getDbContext } from '@/src/lib/session'
import ProfileForm from './ProfileForm'

export default async function ProfilePage() {
  const ctx = await getDbContext()
  if (!ctx) {
    redirect('/api/auth/login?returnTo=/settings/profile')
  }

  return (
    <ProfileForm
      initialDisplayName={ctx.user.displayName}
      email={ctx.user.email}
      role={ctx.user.role}
      orgName={ctx.org.name}
      isAdmin={ctx.user.role === 'ADMIN'}
    />
  )
}
