'use server';

import { requireMember, requireAdmin } from '@/lib/auth/membership';
import * as members from '@/lib/services/membership';
import { rotateInvite as rotate } from '@/lib/services/invites';
import { updateClubSettings as update } from '@/lib/services/club-settings';
import { revalidatePath } from 'next/cache';

function refreshMembership() {
  for (const path of ['/', '/members', '/more', '/more/applicants', '/pending']) revalidatePath(path);
}

export async function approveMember(userId: string) {
  await requireAdmin();
  const result = await members.approveMember(userId);
  if (result.ok) refreshMembership();
  return result;
}
export async function rejectMember(userId: string) {
  await requireAdmin();
  const result = await members.rejectMember(userId);
  if (result.ok) refreshMembership();
  return result;
}
export async function transferAdmin(userId: string) {
  await requireAdmin();
  const result = await members.transferAdmin(userId);
  if (result.ok) refreshMembership();
  return result;
}
export async function leaveMembership() {
  await requireMember();
  const result = await members.leaveMembership();
  if (result.ok) refreshMembership();
  return result;
}
export async function rotateInvite() {
  await requireAdmin();
  return rotate();
}
export async function updateClubSettings(input: { name: string; description?: string | null }) {
  await requireAdmin();
  return update({ name: input.name, description: input.description });
}
export async function applyForMembership(token: string) {
  const result = await members.applyForMembership(token);
  if (!result.ok) return result;
  refreshMembership();
  return { ok: true as const, clubName: result.clubName };
}
