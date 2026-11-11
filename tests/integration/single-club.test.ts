import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

// Fixed local Docker container, never a URL or linked/production project.
function sql(query: string): string {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_book-club', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
    input: query, encoding: 'utf8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
const id = (n: number) => `f2000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const admin = id(1), host = id(2), member = id(3), pending = id(4), outsider = id(5);
const future = id(10), past = id(11), privateReview = id(21), publicReview = id(22);
const anonymousAuthor = id(6), anonymousReview = id(23);
const fixtures = `
-- Emulate Storage API's transaction-local flag for synthetic, rolled-back metadata only.
SET LOCAL storage.allow_delete_query='true';
INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
 SELECT ('f2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'phase2-'||n||'@rollback.local','authenticated','authenticated',now(),now() FROM generate_series(1,6) n;
INSERT INTO public.profiles(id,display_name) SELECT id,email FROM auth.users WHERE email LIKE 'phase2-%@rollback.local';
UPDATE public.profiles SET avatar_url='https://example.invalid/anonymous-author.png' WHERE id='${anonymousAuthor}';
INSERT INTO public.members(user_id,role) VALUES ('${admin}','admin'),('${host}','member'),('${member}','member'),('${pending}','pending'),('${id(6)}','member');
INSERT INTO public.meetings(id,host_id,book_title,book_author,scheduled_at,location_name) VALUES
 ('${future}','${host}','phase2 future','test',now()+interval '7 days','local'),
 ('${past}','${host}','phase2 past','test',now()-interval '7 days','local');
INSERT INTO public.discussion_questions(id,meeting_id,order_idx,content) VALUES ('${id(12)}','${future}',0,'phase2 question');
INSERT INTO public.attendances(id,meeting_id,user_id,status) VALUES ('${id(13)}','${future}','${member}','attending'),('${id(14)}','${past}','${member}','attending');
INSERT INTO public.meeting_reviews(id,meeting_id,user_id,content,visibility) VALUES
 ('${privateReview}','${past}','${host}','private test','private'),
 ('${publicReview}','${past}','${member}','public test','public'),
 ('${anonymousReview}','${past}','${anonymousAuthor}','anonymous test','anonymous');
INSERT INTO public.invites(id,token,created_by,expires_at,revoked_at) VALUES
 ('${id(30)}','phase2-valid','${admin}',now()+interval '1 day',NULL),
 ('${id(31)}','phase2-expired','${admin}',now()-interval '1 day',NULL),
 ('${id(32)}','phase2-revoked','${admin}',now()+interval '1 day',now());
INSERT INTO storage.objects(id,bucket_id,name) VALUES ('${id(40)}','discussion-files','${future}/phase2-test.pdf');
CREATE FUNCTION pg_temp.check_true(ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invariant failed'; END IF; END $$;
`;
function checkAs(user: string | null, body: string, role = 'authenticated') {
  // Every case is one transaction. Even a failed assertion closes the connection and rolls back.
  sql(`BEGIN; SET LOCAL statement_timeout='10s'; ${fixtures}
    SELECT set_config('request.jwt.claim.sub','${user ?? ''}',true);
    SET LOCAL ROLE ${role};
    ${body}
    ROLLBACK;`);
}
const fails = (statement: string, state = 'insufficient_privilege') => `DO $$ DECLARE rejected boolean:=false; BEGIN BEGIN ${statement}; EXCEPTION WHEN ${state} THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection'; END IF; END $$;`;
const is = (condition: string) => `SELECT pg_temp.check_true(${condition});`;
const reviewsForPastMeeting = `public.get_meeting_reviews('${past}')`;
const maskedAnonymousReview = `
  (SELECT count(*) FROM ${reviewsForPastMeeting}
   WHERE id='${anonymousReview}' AND content='anonymous test'
     AND visibility='anonymous' AND user_id IS NULL
     AND display_name='익명' AND avatar_url IS NULL)=1
`;
const tables = ['public.club_settings', 'public.members', 'public.invites', 'public.profiles', 'public.meetings', 'public.discussion_questions', 'public.attendances', 'public.meeting_reviews', 'auth.users', 'auth.identities', 'storage.objects', 'storage.buckets', 'legacy_multiclub.clubs', 'legacy_multiclub.club_members', 'legacy_multiclub.club_invites'];
const fingerprint = () => tables.map(t => sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) FROM ${t} t`)).join('|');
let before: string;
beforeAll(() => { before = fingerprint(); });
afterAll(() => { expect(fingerprint()).toBe(before); });

const cases: Array<[string, string | null, string, string?]> = [
 ['profile creation permits only the authenticated account and preserves its original name on retry', member, `
    RESET ROLE;
    DELETE FROM public.profiles WHERE id='${outsider}';
    SET LOCAL ROLE authenticated;
    ${fails(`INSERT INTO public.profiles(id,display_name) VALUES ('${outsider}','spoofed') ON CONFLICT(id) DO NOTHING`)}
    SELECT set_config('request.jwt.claim.sub','${outsider}',true);
    INSERT INTO public.profiles(id,display_name) VALUES ('${outsider}','first') ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.profiles(id,display_name) VALUES ('${outsider}','retry') ON CONFLICT(id) DO NOTHING;
    ${is(`(SELECT display_name FROM public.profiles WHERE id='${outsider}')='first'`)}
 `],
 ['approved member can read existing meetings and questions', member, is(`(SELECT count(*) FROM public.meetings WHERE id='${future}')=1 AND (SELECT count(*) FROM public.discussion_questions WHERE id='${id(12)}')=1`)],
 ['pending user cannot read meetings', pending, is(`(SELECT count(*) FROM public.meetings)=0`)],
 ['outsider cannot read meetings', outsider, is(`(SELECT count(*) FROM public.meetings)=0`)],
 ['anonymous cannot read meetings', null, is(`(SELECT count(*) FROM public.meetings)=0`), 'anon'],
 ['member can create a meeting as its host', member, `INSERT INTO public.meetings(host_id,book_title,book_author,scheduled_at,location_name) VALUES ('${member}','new','test',now(),'local');`],
 ['member cannot spoof another host', member, fails(`INSERT INTO public.meetings(host_id,book_title,book_author,scheduled_at,location_name) VALUES ('${host}','new','test',now(),'local')`)],
 ['host can edit their own meeting', host, `UPDATE public.meetings SET book_title='edited' WHERE id='${future}'; ${is(`(SELECT book_title FROM public.meetings WHERE id='${future}')='edited'`)}`],
 ['other member cannot edit meeting', member, `UPDATE public.meetings SET book_title='bad' WHERE id='${future}'; ${is(`(SELECT book_title FROM public.meetings WHERE id='${future}')='phase2 future'`)}`],
 ['administrator retains host-only meeting edits', admin, `UPDATE public.meetings SET book_title='bad' WHERE id='${future}'; ${is(`(SELECT book_title FROM public.meetings WHERE id='${future}')='phase2 future'`)}`],
 ['host can append discussion question', host, `INSERT INTO public.discussion_questions(meeting_id,order_idx,content) VALUES ('${future}',1,'allowed');`],
 ['other member cannot append discussion question', member, fails(`INSERT INTO public.discussion_questions(meeting_id,order_idx,content) VALUES ('${future}',1,'denied')`)],
 ['other member cannot change question content', member, `UPDATE public.discussion_questions SET content='bad' WHERE id='${id(12)}'; ${is(`(SELECT content FROM public.discussion_questions WHERE id='${id(12)}')='phase2 question'`)}`],
 ['member can change own attendance', member, `UPDATE public.attendances SET status='undecided' WHERE id='${id(13)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(13)}')='undecided'`)}`],
 ['host can correct another members attendance', host, `UPDATE public.attendances SET status='undecided' WHERE id='${id(13)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(13)}')='undecided'`)}`],
 ['another non-host member cannot change attendance', id(6), `UPDATE public.attendances SET status='undecided' WHERE id='${id(13)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(13)}')='attending'`)}`],
 ['administrator can correct attendance', admin, `UPDATE public.attendances SET status='not_attending' WHERE id='${id(13)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(13)}')='not_attending'`)}`],
 ['pending user cannot insert attendance', pending, fails(`INSERT INTO public.attendances(meeting_id,user_id,status) VALUES ('${future}','${pending}','attending')`)],
 ['regular member cannot rewrite own past attendance', member, `UPDATE public.attendances SET status='not_attending' WHERE id='${id(14)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(14)}')='attending'`)}`],
 ['regular member cannot insert own past attendance', id(6), fails(`INSERT INTO public.attendances(meeting_id,user_id,status) VALUES ('${past}','${id(6)}','attending')`)],
 ['regular member cannot upsert own past attendance', member, fails(`INSERT INTO public.attendances(meeting_id,user_id,status) VALUES ('${past}','${member}','not_attending') ON CONFLICT(meeting_id,user_id) DO UPDATE SET status=excluded.status`)],
 ['regular member cannot move past attendance to future', member, `UPDATE public.attendances SET meeting_id='${future}' WHERE id='${id(14)}'; ${is(`(SELECT meeting_id FROM public.attendances WHERE id='${id(14)}')='${past}'::uuid`)}`],
 ['host can correct past attendance', host, `UPDATE public.attendances SET status='not_attending' WHERE id='${id(14)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(14)}')='not_attending'`)}`],
 ['administrator can correct past attendance', admin, `UPDATE public.attendances SET status='not_attending' WHERE id='${id(14)}'; ${is(`(SELECT status FROM public.attendances WHERE id='${id(14)}')='not_attending'`)}`],
 ['archive has no live foreign-key dependency', admin, is(`NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class p ON p.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace WHERE c.contype='f' AND n.nspname='legacy_multiclub' AND pn.nspname<>'legacy_multiclub')`)],
 ['archive blocks owner writes even when no row is selected', admin, `RESET ROLE; ${fails('UPDATE legacy_multiclub.profiles_before_single_club SET display_name=display_name WHERE false','object_not_in_prerequisite_state')}`],
 ['direct review reads return only the caller’s rows', member, is(`(SELECT count(*) FROM public.meeting_reviews WHERE meeting_id='${past}')=1 AND (SELECT count(*) FROM public.meeting_reviews WHERE id='${publicReview}')=1`)],
 ['member can read a public review and its author through the RPC', host, is(`(SELECT count(*) FROM ${reviewsForPastMeeting} WHERE id='${publicReview}' AND user_id='${member}' AND display_name='phase2-3@rollback.local' AND content='public test')=1`)],
 ['private review is invisible to another member through the RPC', member, is(`(SELECT count(*) FROM ${reviewsForPastMeeting} WHERE id='${privateReview}')=0`)],
 ['member sees anonymous content without author information', member, is(maskedAnonymousReview)],
 ['administrator sees anonymous content without author information', admin, is(maskedAnonymousReview)],
 ['caller cannot identify an anonymous author by joining or filtering', member, `
    ${is(`NOT EXISTS(SELECT 1 FROM public.meeting_reviews r JOIN public.profiles p ON p.id=r.user_id WHERE r.id='${anonymousReview}' OR p.id='${anonymousAuthor}')`)}
    ${is(`NOT EXISTS(SELECT 1 FROM ${reviewsForPastMeeting} WHERE user_id='${anonymousAuthor}')`)}`],
 ['review RPC is scoped to the requested meeting', member, is(`(SELECT count(*) FROM public.get_meeting_reviews('${future}'))=0`)],
 ['pending user receives no reviews through the RPC', pending, is(`(SELECT count(*) FROM ${reviewsForPastMeeting})=0`)],
 ['nonmember receives no reviews through the RPC', outsider, is(`(SELECT count(*) FROM ${reviewsForPastMeeting})=0`)],
 ['unauthenticated caller cannot execute the review RPC', null, fails(`PERFORM * FROM ${reviewsForPastMeeting}`), 'anon'],
 ['anonymous author can read, upsert, and delete their own review', anonymousAuthor, `
    ${is(`(SELECT count(*) FROM ${reviewsForPastMeeting} WHERE id='${anonymousReview}' AND user_id='${anonymousAuthor}' AND display_name='phase2-6@rollback.local' AND avatar_url='https://example.invalid/anonymous-author.png')=1`)}
    INSERT INTO public.meeting_reviews(meeting_id,user_id,content,visibility)
      VALUES ('${past}','${anonymousAuthor}','edited','private')
      ON CONFLICT(meeting_id,user_id) DO UPDATE SET content=excluded.content, visibility=excluded.visibility
      RETURNING id;
    ${is(`(SELECT count(*) FROM ${reviewsForPastMeeting} WHERE id='${anonymousReview}' AND content='edited' AND visibility='private')=1`)}
    DELETE FROM public.meeting_reviews WHERE meeting_id='${past}' AND user_id='${anonymousAuthor}';
    ${is(`NOT EXISTS(SELECT 1 FROM ${reviewsForPastMeeting} WHERE id='${anonymousReview}')`)}`],
 ['member can create a new anonymous review', admin, `
    INSERT INTO public.meeting_reviews(meeting_id,user_id,content,visibility)
      VALUES ('${past}','${admin}','new anonymous test','anonymous')
      ON CONFLICT(meeting_id,user_id) DO UPDATE SET content=excluded.content, visibility=excluded.visibility
      RETURNING id;
    ${is(`(SELECT count(*) FROM ${reviewsForPastMeeting} WHERE user_id='${admin}' AND content='new anonymous test' AND visibility='anonymous')=1`)}`],
 ['other member cannot overwrite or delete another review', host, `
    UPDATE public.meeting_reviews SET content='bad' WHERE id='${publicReview}';
    DELETE FROM public.meeting_reviews WHERE id='${publicReview}';
    ${is(`(SELECT content FROM ${reviewsForPastMeeting} WHERE id='${publicReview}')='public test'`)}`],
 ['member cannot approve pending user', member, `UPDATE public.members SET role='member' WHERE user_id='${pending}'; ${is(`(SELECT role FROM public.members WHERE user_id='${pending}')='pending'`)}`],
 ['pending user cannot promote themselves', pending, `UPDATE public.members SET role='admin' WHERE user_id='${pending}'; ${is(`(SELECT role FROM public.members WHERE user_id='${pending}')='pending'`)}`],
 ['administrator can approve pending user', admin, `UPDATE public.members SET role='member' WHERE user_id='${pending}'; ${is(`(SELECT role FROM public.members WHERE user_id='${pending}')='member'`)}`],
 ['administrator can reject pending user', admin, `DELETE FROM public.members WHERE user_id='${pending}'; ${is(`(SELECT count(*) FROM public.members WHERE user_id='${pending}')=0`)}`],
 ['member can leave without deleting account', member, `DELETE FROM public.members WHERE user_id='${member}'; ${is(`(SELECT count(*) FROM public.members WHERE user_id='${member}')=0 AND (SELECT count(*) FROM public.profiles WHERE id='${member}')=1`)}`],
 ['administrator cannot leave directly', admin, `DELETE FROM public.members WHERE user_id='${admin}'; ${is(`(SELECT role FROM public.members WHERE user_id='${admin}')='admin'`)}`],
 ['administrator transfer is atomic', admin, `SELECT public.transfer_admin('${member}'); ${is(`(SELECT role FROM public.members WHERE user_id='${member}')='admin' AND (SELECT role FROM public.members WHERE user_id='${admin}')='member'`)}`],
 ['transfer to pending user is rejected', admin, fails(`PERFORM public.transfer_admin('${pending}')`, 'raise_exception')],
 ['member cannot transfer administrator', member, fails(`PERFORM public.transfer_admin('${host}')`, 'raise_exception')],
 ['valid invite creates pending membership', outsider, `${is(`(public.apply_for_membership('phase2-valid')->>'status')='applied'`)} ${is(`(SELECT role FROM public.members WHERE user_id='${outsider}')='pending'`)}`],
 ['already member application preserves membership', member, is(`(public.apply_for_membership('phase2-valid')->>'status')='already_member' AND (SELECT role FROM public.members WHERE user_id='${member}')='member'`)],
 ['already pending application is idempotent', pending, is(`(public.apply_for_membership('phase2-valid')->>'status')='already_pending'`)],
 ['invalid invite cannot add membership', outsider, fails(`PERFORM public.apply_for_membership('does-not-exist')`, 'raise_exception')],
 ['expired invite cannot add membership', outsider, fails(`PERFORM public.apply_for_membership('phase2-expired')`, 'raise_exception')],
 ['revoked invite cannot add membership', outsider, fails(`PERFORM public.apply_for_membership('phase2-revoked')`, 'raise_exception')],
 ['member cannot rotate invite', member, fails('PERFORM public.rotate_invite()', 'raise_exception')],
 ['administrator can rotate without deleting old invite', admin, `SELECT public.rotate_invite(); ${is(`(SELECT count(*) FROM public.invites WHERE token='phase2-valid' AND revoked_at IS NOT NULL)=1`)}`],
 ['anonymous cannot call membership RPC', null, fails(`PERFORM public.apply_for_membership('phase2-valid')`), 'anon'],
 ['admin emails are server-only', member, fails('PERFORM public.get_admin_emails()')],
 ['legacy archived records are private', admin, fails('PERFORM count(*) FROM legacy_multiclub.clubs')],
 ['group settings cannot be deleted', admin, fails('DELETE FROM public.club_settings WHERE id=1')],
 ['group settings cannot be duplicated', admin, fails(`INSERT INTO public.club_settings(id,legacy_club_id,name,created_by) VALUES(2,gen_random_uuid(),'duplicate','${admin}')`)],
 ['administrator can update service description', admin, `UPDATE public.club_settings SET description='rollback test' WHERE id=1; ${is(`(SELECT description FROM public.club_settings WHERE id=1)='rollback test'`)}`],
 ['legacy service ID is immutable through user API', admin, fails(`UPDATE public.club_settings SET legacy_club_id=gen_random_uuid() WHERE id=1`)],
 ['membership user ID is immutable through user API', admin, fails(`UPDATE public.members SET user_id='${outsider}' WHERE user_id='${pending}'`)],
 ['single-club schema has no active group foreign keys', admin, is(`NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND column_name='club_id')`)],
 ['host cannot move file into another meeting path', host, fails(`UPDATE storage.objects SET name='${id(99)}/moved.pdf' WHERE id='${id(40)}'`,'insufficient_privilege')],
 ['host can upload into own meeting path', host, `INSERT INTO storage.objects(bucket_id,name) VALUES('discussion-files','${future}/own.pdf');`],
 ['other member cannot upload into host path', member, fails(`INSERT INTO storage.objects(bucket_id,name) VALUES('discussion-files','${future}/foreign.pdf')`)],
 ['other member cannot delete discussion file', member, `DELETE FROM storage.objects WHERE id='${id(40)}'; ${is(`(SELECT count(*) FROM storage.objects WHERE id='${id(40)}')=1`)}`],
 ['host can delete own discussion file', host, `DELETE FROM storage.objects WHERE id='${id(40)}'; ${is(`(SELECT count(*) FROM storage.objects WHERE id='${id(40)}')=0`)}`],
];

describe('single-club Postgres/RLS regression (every case rolls back)', () => {
  for (const [name, user, body, role] of cases) it(name, () => checkAs(user, body, role));
});
