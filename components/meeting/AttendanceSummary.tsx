import type { Attendance, Profile } from '@/lib/types';

export function AttendanceSummary({
  attendances,
}: {
  attendances: Array<Attendance & { profile: Profile }>;
}) {
  const groups = {
    attending: attendances.filter((a) => a.status === 'attending'),
    not_attending: attendances.filter((a) => a.status === 'not_attending'),
    undecided: attendances.filter((a) => a.status === 'undecided'),
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">참석 현황</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="참석" count={groups.attending.length} />
        <Stat label="불참" count={groups.not_attending.length} />
        <Stat label="미정" count={groups.undecided.length} />
      </div>
      {groups.attending.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">참석자 명단</summary>
          <ul className="mt-2 space-y-1 pl-4 text-slate-700">
            {groups.attending.map((a) => (
              <li key={a.id}>· {a.profile.display_name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-slate-50 rounded p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold">{count}</p>
    </div>
  );
}
