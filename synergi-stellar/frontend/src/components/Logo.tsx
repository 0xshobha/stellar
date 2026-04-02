interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return <img alt="SynergiStellar logo" className={className ?? 'h-8 w-8'} src="/logo.svg" />;
}
