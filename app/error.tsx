'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">😵 오류가 발생했어요</p>
        <p className="text-sm text-slate-600">{error.message}</p>
        <button onClick={reset} className="underline">다시 시도</button>
      </div>
    </div>
  );
}
