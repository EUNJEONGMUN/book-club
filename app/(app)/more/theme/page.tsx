import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireMember } from '@/lib/auth/membership';
import { ThemeSettings } from '@/components/theme/ThemeSettings';

export default async function ThemePage() {
  await requireMember();

  return (
    <div className="space-y-5 pb-4">
      <Link href="/more" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> 설정
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">테마 변경</h1>
      <ThemeSettings />
    </div>
  );
}
