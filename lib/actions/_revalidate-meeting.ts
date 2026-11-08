import { revalidatePath } from 'next/cache';
export async function revalidateMeetingPaths(meetingId: string): Promise<void> {
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
  revalidatePath('/members');
  revalidatePath('/');
}
