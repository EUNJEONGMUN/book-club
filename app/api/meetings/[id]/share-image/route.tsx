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

    const date = new Date(meeting.scheduled_at);
    const dateStr = format(date, 'yyyy.MM.dd EEE HH:mm', { locale: ko }).toUpperCase();
    const locationLine =
      meeting.location_address && meeting.location_name !== '미정'
        ? `<${meeting.location_name}> ${meeting.location_address}`
        : meeting.location_name;

    const hasBookTitle = meeting.book_title && meeting.book_title !== '미정';

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

          {/* 책 영역 — 표지 이미지 일시 제거, 제목만 큰 텍스트로 */}
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
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[share-image]', e);
    Sentry.captureException(e, { tags: { route: 'share-image' } });
    return new Response(`Image generation failed: ${msg}`, { status: 500 });
  }
}
