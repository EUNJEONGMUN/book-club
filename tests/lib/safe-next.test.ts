import { describe, expect, it } from 'vitest';
import { sanitizeNext } from '@/lib/auth/safe-next';

describe('인증 후 이동 주소', () => {
  it.each(['/', '/meetings/id', '/meetings/id?tab=questions', '/검색?q=한글'])('정상 내부 주소 %s를 유지한다', path => {
    expect(sanitizeNext(path)).toBe(path);
  });
  it.each([undefined, null, '', 'https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\r/example.com', '/\n/example.com', '/\u0000/example.com'])('위험하거나 없는 주소 %j는 홈으로 연결한다', path => {
    expect(sanitizeNext(path)).toBe('/');
  });
});
