import { NO_INDEX_ROBOTS } from '@/lib/seo';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { viewer, emailVerificationEnabled } from '@/lib/server/core';
import { VerifyEmailForm } from '@/components/community/verify-email-form';

export const metadata: Metadata = {
  title: 'Подтверждение email — AniMonster',
  robots: NO_INDEX_ROBOTS,
};

export default async function VerifyEmailPage() {
  // This page must remain accessible before email verification. requireUser
  // intentionally blocks unverified accounts and cannot be used here.
  const user = await viewer(new Request('http://internal/verify-email', {
    headers: await headers(),
  }));
  return (
    <VerifyEmailForm
      initialEmail={user?.email || ''}
      confirmed={!emailVerificationEnabled() || !!user && (!user.email || !!user.email_verified)}
    />
  );
}
