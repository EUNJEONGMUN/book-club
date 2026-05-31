import { getMyInvites } from '@/lib/queries/invites';
import { InviteList } from '@/components/invite/InviteList';

export default async function InvitePage() {
  const invites = await getMyInvites();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">초대 링크</h1>
      <p className="text-sm text-slate-600">
        생성 후 카카오톡 등으로 전달하세요. 1회용이며 7일 후 만료됩니다.
      </p>
      <InviteList initial={invites} siteUrl={siteUrl} />
    </div>
  );
}
