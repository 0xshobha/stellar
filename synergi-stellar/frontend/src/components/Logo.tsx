import Image from 'next/image';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <Image
      alt="SynergiStellar logo"
      className={className ?? 'h-8 w-8'}
      height={32}
      priority
      src="/logo.svg"
      width={32}
    />
  );
}
