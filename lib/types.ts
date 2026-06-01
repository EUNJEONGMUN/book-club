import type { Database } from './database.types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Profile = Tables<'profiles'>;
export type Meeting = Tables<'meetings'>;
export type Attendance = Tables<'attendances'>;
export type DiscussionQuestion = Tables<'discussion_questions'>;
export type AttendanceStatus = Database['public']['Enums']['attendance_status'];
