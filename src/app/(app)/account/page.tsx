import { requireUser } from '@/lib/auth';
import { changePasswordAction } from '@/lib/actions/auth';
import { Card, Flash, Notice, PageHeader, TextField } from '@/components/ui';
import { SubmitButton } from '@/components/client';

export const metadata = { title: 'My account' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="My account" subtitle={user.email} />
      <Flash params={params} />
      {user.mustChangePassword && (
        <div className="mb-4">
          <Notice tone="warn">You are using a temporary password. Choose your own password to continue.</Notice>
        </div>
      )}
      <Card title="Change password">
        <form action={changePasswordAction} className="space-y-4">
          <TextField label="Current password" name="current" type="password" autoComplete="current-password" required />
          <TextField label="New password" name="next" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." />
          <TextField label="New password again" name="again" type="password" autoComplete="new-password" required minLength={10} />
          <SubmitButton>Change password</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
