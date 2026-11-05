export function ErrorCard({ message, className = "" }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p className={`rounded-2xl bg-[#d65959] px-4 py-3 text-sm text-black ${className}`}>{message}</p>
  );
}
