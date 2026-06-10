'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OnboardingPage() {
  const [code, setCode] = useState('');

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast.info('초대코드 가입은 곧 활성화됩니다. 잠시만 기다려주세요.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">시작하기</h1>
          <p className="text-sm text-stone-500">새 그룹을 만들거나 초대코드로 가입할 수 있어요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-5">
          <Link href="/clubs/new" className="block">
            <Button className="w-full bg-stone-800 hover:bg-stone-700 text-white gap-2">
              <Plus className="w-4 h-4" />
              새 그룹 만들기
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-100" />
            <span className="text-xs text-stone-400">또는</span>
            <div className="flex-1 h-px bg-stone-100" />
          </div>

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
              disabled={code.trim().length === 0}
              className="w-full gap-2"
            >
              <Key className="w-4 h-4" />
              초대코드로 가입
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
