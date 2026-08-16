// Self-hosted entry point — renders SelfHostedShell instead of StandaloneShell.
// Use this file in self-hosted mode by setting NEXT_PUBLIC_SELF_HOSTED=1.

import SelfHostedShell from '../components/SelfHostedShell';

export default function SelfHostedStudioPage() {
  return <SelfHostedShell />;
}
