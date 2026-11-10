import { requireMember } from '@/lib/auth/membership';
export default async function MeetingsLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return children;
}
