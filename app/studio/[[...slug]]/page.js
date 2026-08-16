import { headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import SelfHostedShell from '@/components/SelfHostedShell';

const isSelfHosted = process.env.NEXT_PUBLIC_SELF_HOSTED === '1';

export const metadata = {
  title: isSelfHosted ? 'Studio — AI Cinema' : 'Studio — Open Generative AI',
};

export default function StudioPage() {
  // In self-hosted mode, use the simplified shell
  if (isSelfHosted) {
    return <SelfHostedShell />;
  }

  return <StandaloneShell />;
}
