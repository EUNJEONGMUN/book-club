import { notFound, redirect } from 'next/navigation';
import { getLegacyClubId } from '@/lib/legacy-club-url';

export default async function LegacyPage({ params }: { params: Promise<{ id: string; meetingId?: string }> }) {
  const p = await params;
  if (p.id !== await getLegacyClubId()) notFound();
  redirect(`/meetings`);
}
