export function Icon({
  name,
  filled = false,
  size = 20,
}: {
  name: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <span
      className="material-symbols-outlined leading-none"
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' ${size}`,
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
