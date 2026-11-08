'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Key, Loader2 } from 'lucide-react';
import { applyForMembership } from '@/lib/actions/club';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OnboardingForm({ clubName }: { clubName: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await applyForMembership(code);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success(`${result.clubName}에 가입 신청을 보냈어요. 관리자 승인을 기다려주세요.`);
    setSubmitting(false);
    router.push('/pending');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">{clubName}에 오신 걸 환영해요</h1>
          <p className="text-sm text-stone-500">관리자에게 받은 초대코드로 가입을 신청해주세요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-5">
          <form onSubmit={handleCodeSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-stone-700">초대코드 또는 링크</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-XYZ-123 또는 초대 URL 전체"
                className="bg-stone-50 border-stone-200 focus:bg-white"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={submitting || code.trim().length === 0}
              className="w-full gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              초대코드로 가입
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
