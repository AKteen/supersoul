import Image from "next/image";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-white">
      <Image
        src="/supersoul.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 rounded-full"
        priority
      />
      SuperSoul
    </span>
  );
}
