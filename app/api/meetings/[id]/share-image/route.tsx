import { ImageResponse } from 'next/og';
import * as Sentry from '@sentry/nextjs';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1380;
const BG = '#f3c8c4';
const TEXT_DARK = '#2c2825';
const TEXT_MID = '#5a4f4a';

const HEADLINE_MAX = 40;
const BODY_MAX = 200;

// Pretendard 한글 폰트 (라우트 옆 ./fonts/ 에 OTF 번들).
// import.meta.url 패턴 — Vercel 함수 번들에 포함되는 표준 방법.
async function loadFontSafe(relPath: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(new URL(relPath, import.meta.url));
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Kakao 책 검색 API thumbnail URL은 R120x174 같은 작은 사이즈로 리사이즈된 것.
 * 표시는 640×800인데 120 원본을 업스케일하니 흐림. URL의 R\d+x\d+ 패턴을 더
 * 큰 사이즈로 바꿔 깨끗한 이미지를 받아본다. 패턴 매치 안 되면 URL 그대로.
 */
function upscaleKakaoCoverUrl(url: string): string {
  return url.replace(/\/R\d+x\d+/, '/R600x870');
}

async function fetchImageOnce(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2 * 1024 * 1024) return null;
    const base64 = Buffer.from(buf).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * 책 표지 외부 URL을 서버에서 fetch + base64 data URI로 변환.
 * 1) 업스케일 URL 먼저 시도 (Kakao 패턴이면 R600), 2) 실패 시 원본 URL.
 */
async function fetchBookCoverDataUri(url: string): Promise<string | null> {
  const upscaled = upscaleKakaoCoverUrl(url);
  const primary = await fetchImageOnce(upscaled);
  if (primary) return primary;
  if (upscaled !== url) return await fetchImageOnce(url);
  return null;
}

async function isClubMember(clubId: string, userId: string): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'admin' || data?.role === 'member';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const headlineRaw = (url.searchParams.get('headline') ?? '').trim();
    const bodyRaw = (url.searchParams.get('body') ?? '').trim();
    const headline = headlineRaw.slice(0, HEADLINE_MAX);
    const body = bodyRaw.slice(0, BODY_MAX);

    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const meeting = await getMeetingDetail(id);
    if (!meeting) return new Response('Not found', { status: 404 });

    const allowed = await isClubMember(meeting.club_id, user.id);
    if (!allowed) return new Response('Forbidden', { status: 403 });

    // 폰트 — import.meta.url 기반 (각자 독립 try, 실패해도 진행)
    const [boldFont, regularFont] = await Promise.all([
      loadFontSafe('./fonts/Pretendard-Bold.otf'),
      loadFontSafe('./fonts/Pretendard-Regular.otf'),
    ]);
    const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] = [];
    if (regularFont) fonts.push({ name: 'Pretendard', data: regularFont, weight: 400, style: 'normal' });
    if (boldFont) fonts.push({ name: 'Pretendard', data: boldFont, weight: 700, style: 'normal' });
    const fontFamilyValue = fonts.length > 0 ? 'Pretendard, sans-serif' : undefined;

    const date = new Date(meeting.scheduled_at);
    const dateStr = format(date, 'yyyy.MM.dd EEE HH:mm', { locale: ko }).toUpperCase();
    const locationLine =
      meeting.location_address && meeting.location_name !== '미정'
        ? `<${meeting.location_name}> ${meeting.location_address}`
        : meeting.location_name;

    const hasBookTitle = meeting.book_title && meeting.book_title !== '미정';
    // 책 표지 — 서버 fetch + base64 인라인 (Satori가 외부 fetch 안 함)
    const coverDataUri = meeting.book_cover_url
      ? await fetchBookCoverDataUri(meeting.book_cover_url)
      : null;

    // ImageResponse가 throw하면 framework가 가로채니까 따로 더 감쌀 수 있는 게 별로 없음.
    // 일단 폰트/이미지 빼고 plumbing부터 검증.
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            background: BG,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '70px 60px',
            ...(fontFamilyValue ? { fontFamily: fontFamilyValue } : {}),
          }}
        >
          {/* 헤드라인 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 90,
              textAlign: 'center',
              width: '100%',
            }}
          >
            {headline ? (
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  color: TEXT_DARK,
                  lineHeight: 1.3,
                }}
              >
                {`"${headline}"`}
              </span>
            ) : null}
          </div>

          {/* 책 영역 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              margin: '20px 0',
            }}
          >
            {coverDataUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverDataUri}
                alt=""
                style={{
                  maxHeight: 800,
                  maxWidth: 640,
                  objectFit: 'contain',
                  borderRadius: 6,
                  boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 600,
                  height: 800,
                  background: '#ffffffaa',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 28,
                  padding: '0 40px',
                }}
              >
                <span style={{ fontSize: 220 }}>📖</span>
                {hasBookTitle ? (
                  <span
                    style={{
                      fontSize: 52,
                      fontWeight: 700,
                      color: TEXT_DARK,
                      textAlign: 'center',
                    }}
                  >
                    {meeting.book_title}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* 본문 */}
          {body ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                textAlign: 'center',
                marginBottom: 12,
                width: '100%',
              }}
            >
              <span
                style={{
                  fontSize: 32,
                  color: TEXT_MID,
                  lineHeight: 1.55,
                  maxWidth: 900,
                }}
              >
                {body}
              </span>
            </div>
          ) : null}

          {/* 일시 + 장소 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            <span style={{ fontSize: 30, fontWeight: 700, color: TEXT_DARK }}>
              {dateStr}
            </span>
            <span
              style={{
                fontSize: 26,
                color: TEXT_MID,
                textAlign: 'center',
                maxWidth: 980,
              }}
            >
              {locationLine}
            </span>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        ...(fonts.length > 0 ? { fonts } : {}),
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[share-image]', e);
    Sentry.captureException(e, { tags: { route: 'share-image' } });
    return new Response(`Image generation failed: ${msg}`, { status: 500 });
  }
}
