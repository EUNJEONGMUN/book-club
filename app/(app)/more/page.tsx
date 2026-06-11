import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getCurrentProfile } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogoutButton } from './logout-button';

export default async function MorePage() {
  const me = await getCurrentProfile();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">설정</h1>

      {/* 내 프로필 */}
      <Link
        href="/more/profile"
        className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-stone-100 shadow-sm hover:bg-stone-50 transition-colors"
      >
        <Avatar className="w-12 h-12">
          <AvatarImage src={me?.avatar_url ?? undefined} alt={me?.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-base font-medium">
            {me?.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800">{me?.display_name}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
      </Link>

      <LogoutButton />
    </div>
  );
}
