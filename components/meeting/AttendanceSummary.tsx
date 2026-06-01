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
      <div className="grid grid-cols-3 gap-2">
        <StatusGroup
          label="참석"
          members={groups.attending}
          bg="bg-blue-50"
          text="text-blue-700"
          countColor="text-blue-600"
          summaryColor="text-blue-500"
        />
        <StatusGroup
          label="불참"
          members={groups.not_attending}
          bg="bg-red-50"
          text="text-red-700"
          countColor="text-red-500"
          summaryColor="text-red-400"
        />
        <StatusGroup
          label="미정"
          members={groups.undecided}
          bg="bg-amber-50"
          text="text-amber-700"
          countColor="text-amber-500"
          summaryColor="text-amber-400"
        />
      </div>
    </div>
  );
}

function StatusGroup({
  label,
  members,
  bg,
  text,
  countColor,
  summaryColor,
}: {
  label: string;
  members: Array<Attendance & { profile: Profile }>;
  bg: string;
  text: string;
  countColor: string;
  summaryColor: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 space-y-2`}>
      <div className="text-center">
        <p className={`text-xs font-medium ${text}`}>{label}</p>
        <p className={`text-2xl font-bold ${countColor}`}>{members.length}</p>
      </div>
      {members.length > 0 && (
        <details className="text-xs">
          <summary className={`cursor-pointer ${summaryColor} list-none text-center`}>
            명단 보기
          </summary>
          <ul className="mt-2 space-y-1">
            {members.map((a) => (
              <li key={a.id} className={`${text} truncate`}>
                · {a.profile.display_name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
