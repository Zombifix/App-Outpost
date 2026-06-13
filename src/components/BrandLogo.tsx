export function BrandLogo({ className = 'brand-logo' }: { className?: string }) {
  return (
    <img className={className} src="/brand-logo.svg" alt="" aria-hidden="true" draggable={false} />
  )
}
