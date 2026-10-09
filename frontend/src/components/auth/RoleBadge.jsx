import { Badge } from '../ui'

const TONES = {
  cliente: 'slate',
  tecnico: 'emerald',
  admin: 'amber',
}

export default function RoleBadge({ role }) {
  return <Badge tone={TONES[role] ?? 'slate'}>{role}</Badge>
}
