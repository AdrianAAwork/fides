export const CLAIMS = {
  ORG_ID: 'https://fides.app/org_id',
  ROLE: 'https://fides.app/role',
  ACCOUNT_TYPE: 'https://fides.app/account_type',
  NEEDS_ONBOARDING: 'https://fides.app/needs_onboarding',
} as const

export type Role = 'VIEWER' | 'ANALYST' | 'ADMIN'

const roleHierarchy: Record<Role, number> = {
  VIEWER: 1,
  ANALYST: 2,
  ADMIN: 3,
}

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}
