import { NextResponse, type NextRequest } from 'next/server';

export function maintenanceResponse(req: NextRequest): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== '1') return null;
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '60' };
  if (req.method !== 'GET' || req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '서비스 점검 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 503, headers });
  }
  return new NextResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>잠시 점검 중입니다</title><main style="max-width:480px;margin:15vh auto;padding:24px;font-family:system-ui"><h1>잠시 점검 중입니다</h1><p>기존 기록을 안전하게 보존하며 서비스를 점검하고 있습니다. 잠시 후 다시 접속해주세요.</p></main></html>', {
    status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
