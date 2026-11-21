import { requireMember } from '@/lib/auth/membership';
import { ThemeSettings } from '@/components/theme/ThemeSettings';
import { SettingsBackLink } from '../settings-back-link';

export default async function ThemePage() {
  await requireMember();

  return (
    <div className="space-y-5 pb-4">
      <SettingsBackLink />
      <h1 className="text-2xl font-bold tracking-tight text-foreground">테마 변경</h1>
      <ThemeSettings />
    </div>
  );
}
