import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ClubCreateForm } from '@/components/club/ClubCreateForm';

export default function NewClubPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/clubs" className="text-stone-500 hover:text-stone-800">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">새 그룹 만들기</h1>
      </div>
      <ClubCreateForm />
    </div>
  );
}
