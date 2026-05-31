import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">🔍 페이지를 찾을 수 없습니다</p>
        <Link href="/" className="underline text-sm">홈으로</Link>
      </div>
    </div>
  );
}
