import { ImageResponse } from 'next/og';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const WIDTH = 1080;
const HEIGHT = 1380;
// 시안 색상
const BG = '#f3c8c4'; // 살구/연분홍 배경
const TEXT_DARK = '#2c2825';
const TEXT_MID = '#5a4f4a';

const HEADLINE_MAX = 40;
const BODY_MAX = 200;

// Pretendard CDN (Bold + Regular). next/og fonts 옵션에 ArrayBuffer로 전달.
const FONT_BOLD_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2';
const FONT_REGULAR_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2';

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  return await res.arrayBuffer();
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
  const { id } = await params;
  const url = new URL(req.url);
  const headlineRaw = (url.searchParams.get('headline') ?? '').trim();
  const bodyRaw = (url.searchParams.get('body') ?? '').trim();
  const headline = headlineRaw.slice(0, HEADLINE_MAX);
  const body = bodyRaw.slice(0, BODY_MAX);

  // 인증 + 권한
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const meeting = await getMeetingDetail(id);
  if (!meeting) return new Response('Not found', { status: 404 });

  const allowed = await isClubMember(meeting.club_id, user.id);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const [boldFont, regularFont] = await Promise.all([
    fetchFont(FONT_BOLD_URL),
    fetchFont(FONT_REGULAR_URL),
  ]);

  const date = new Date(meeting.scheduled_at);
  const dateStr = format(date, 'yyyy.MM.dd EEE HH:mm', { locale: ko }).toUpperCase();
  const locationLine =
    meeting.location_address && meeting.location_name !== '미정'
      ? `<${meeting.location_name}> ${meeting.location_address}`
      : meeting.location_name;

  const hasCover = !!meeting.book_cover_url && meeting.book_cover_url.length > 0;
  const hasBookTitle = meeting.book_title && meeting.book_title !== '미정';

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
          fontFamily: 'Pretendard',
        }}
      >
        {/* 헤드라인 */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 90,
            textAlign: 'center',
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

        {/* 책 표지 */}
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
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meeting.book_cover_url!}
              alt=""
              style={{
                maxHeight: 720,
                maxWidth: 580,
                objectFit: 'contain',
                borderRadius: 6,
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
              }}
            />
          ) : (
            <div
              style={{
                width: 480,
                height: 640,
                background: '#ffffff80',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 28,
              }}
            >
              <span style={{ fontSize: 200 }}>📖</span>
              {hasBookTitle ? (
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: TEXT_DARK,
                    textAlign: 'center',
                    padding: '0 30px',
                    maxWidth: 420,
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
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 32,
                color: TEXT_MID,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
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
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
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
      fonts: [
        { name: 'Pretendard', data: regularFont, weight: 400, style: 'normal' },
        { name: 'Pretendard', data: boldFont, weight: 700, style: 'normal' },
      ],
    }
  );
}
