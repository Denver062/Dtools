import logo from '../Dtools logo.png'

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <img
      src={logo}
      className={className}
      alt="Dtools"
      width={252}
      height={60}
      draggable={false}
    />
  )
}
