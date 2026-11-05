export function ErrorCard({ message, className = "" }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p className={`rounded-2xl bg-[#f8d0d0] px-4 py-3 text-sm text-[#3a3a3a] ${className}`}>{message}</p>
  );
}
