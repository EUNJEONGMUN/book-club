import { describe, it, expect } from 'vitest';
import { admin } from './helpers/admin';

describe('integration infra smoke', () => {
  it('admin() 클라이언트로 auth.admin.listUsers 호출 성공', async () => {
    const { data, error } = await admin().auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data?.users)).toBe(true);
  });
});
