import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { getSupabaseServer } from '@/lib/supabase/server';

const FROM_ADDRESS = process.env.RESEND_FROM ?? 'onboarding@resend.dev';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://book-club-five-nu.vercel.app';

/**
 * 가입 신청이 들어오면 클럽 admin들에게 이메일로 알림.
 * - RESEND_API_KEY 없으면 조용히 no-op (개발 환경 등)
 * - 발송 실패해도 호출자(applyToClub 등) 흐름은 깨지지 않게 — 호출은 fire-and-forget
 * - 무료 Resend onboarding 도메인(`onboarding@resend.dev`)은 Resend 계정 본인 이메일에만
 *   발송 가능. 그 외 수신자 보내려면 RESEND_FROM 에 검증된 도메인 주소 설정 필요.
 */
export async function notifyAdminsOnApply(opts: {
  clubId: string;
  clubName: string;
  applicantDisplayName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // 환경 미설정 — 조용히 skip

  try {
    const supabase = await getSupabaseServer();
    const { data: rows, error } = await supabase.rpc('get_club_admin_emails', {
      target_club_id: opts.clubId,
    });
    if (error) {
      console.error('[notifyAdminsOnApply] rpc error', error);
      Sentry.captureException(error, { tags: { notification: 'admin-apply' } });
      return;
    }
    const emails = (rows ?? [])
      .map((r: { email: string }) => r.email)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (emails.length === 0) return;

    const resend = new Resend(apiKey);
    const applicantsUrl = `${SITE_URL}/clubs/${opts.clubId}/applicants`;
    const subject = `[부글부글] ${opts.clubName}에 새 가입 신청`;

    // 개별 발송 (admin들끼리 서로 이메일 노출 방지)
    await Promise.all(
      emails.map((to) =>
        resend.emails.send({
          from: FROM_ADDRESS,
          to,
          subject,
          html: renderHtml({
            applicantName: opts.applicantDisplayName,
            clubName: opts.clubName,
            applicantsUrl,
          }),
        })
      )
    );
  } catch (e) {
    console.error('[notifyAdminsOnApply]', e);
    Sentry.captureException(e, { tags: { notification: 'admin-apply' } });
  }
}

function renderHtml({
  applicantName,
  clubName,
  applicantsUrl,
}: {
  applicantName: string;
  clubName: string;
  applicantsUrl: string;
}): string {
  const safeName = escapeHtml(applicantName);
  const safeClub = escapeHtml(clubName);
  return `<!doctype html>
<html lang="ko"><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 24px auto; padding: 24px; color: #2c2825; line-height: 1.55;">
  <h2 style="font-size: 18px; margin: 0 0 12px;">새 가입 신청이 들어왔어요</h2>
  <p style="margin: 0 0 16px;"><strong>${safeName}</strong> 님이 <strong>${safeClub}</strong>에 가입을 신청했습니다.</p>
  <p style="margin: 0 0 20px;">
    <a href="${applicantsUrl}" style="display: inline-block; background: #2c2825; color: #fff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      신청자 보러 가기
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999; margin: 0;">부글부글 — 독서모임 관리</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
