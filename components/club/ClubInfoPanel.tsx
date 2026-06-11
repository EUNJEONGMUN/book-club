'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, Pencil } from 'lucide-react';
import { updateClub } from '@/lib/actions/club-info';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Club } from '@/lib/types';

export function ClubInfoPanel({ club }: { club: Club }) {
  const router = useRouter();
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== club.name || (description.trim() || null) !== (club.description ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    const result = await updateClub({
      clubId: club.id,
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹 정보를 저장했어요.');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Pencil className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">그룹 정보</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-stone-700">그룹 이름</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            className="bg-stone-50 border-stone-200 focus:bg-white"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-stone-700">설명 (선택)</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="그룹 소개를 입력해주세요."
            className="block w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
          <p className="text-xs text-stone-400 text-right">{description.length}/500</p>
        </div>
        <Button type="submit" disabled={saving || !dirty} className="gap-1 bg-stone-800 hover:bg-stone-700 text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </Button>
      </form>
    </section>
  );
}
