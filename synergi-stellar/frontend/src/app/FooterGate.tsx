'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export default function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/') return null;
  return <>{children}</>;
}
