import { redirect } from 'next/navigation';
import { homeFor, requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireUser();
  redirect(homeFor(user));
}
