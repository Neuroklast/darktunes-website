import type { OrganizationBranding } from '@/lib/api/organizationBranding'

interface Props {
  branding: OrganizationBranding | null
}

/** Injects tenant CSS variables when branding differs from darkTunes defaults. */
export function OrganizationBrandingInjector({ branding }: Props) {
  if (!branding) return null

  const rules: string[] = []
  if (branding.primaryColor) rules.push(`--primary: ${branding.primaryColor}`)
  if (branding.secondaryColor) rules.push(`--secondary: ${branding.secondaryColor}`)
  if (branding.fontFamily) rules.push(`font-family: ${branding.fontFamily}`)

  if (!rules.length) return null
  return <style>{`:root { ${rules.join('; ')} }`}</style>
}