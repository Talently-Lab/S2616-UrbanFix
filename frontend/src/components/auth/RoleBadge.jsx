import { Badge } from '../ui'

const TONES = {
  cliente: 'slate',
  tecnico: 'emerald',
  admin: 'amber',
}

const LABELS = {
  cliente: 'Cliente',
  tecnico: 'Técnico',
  admin: 'Admin',
}

export default function RoleBadge({ role }) {
  return <Badge tone={TONES[role] ?? 'slate'}>{LABELS[role] ?? role}</Badge>
}
