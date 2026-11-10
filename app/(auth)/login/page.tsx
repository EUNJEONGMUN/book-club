import { getClubName } from '@/lib/club-name';
import LoginForm from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() { return <LoginForm clubName={await getClubName()} />; }
