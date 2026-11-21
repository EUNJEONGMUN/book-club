import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const labels = {
  '/more': '설정',
  '/pending': '승인 대기',
  '/onboarding': '초대 안내',
};

export function SettingsBackLink({ href = '/more' }: { href?: keyof typeof labels }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <ArrowLeft aria-hidden="true" className="size-4" />
      {labels[href]}
    </Link>
  );
}
