"use client";

import { socratesTableUrl } from "@/lib/countdown";

export function VerifyLink({ norad }: { norad: number }) {
  return (
    <a
      href={socratesTableUrl(norad)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] tracking-wide text-muted uppercase hover:text-accent hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      Verify on CelesTrak
    </a>
  );
}
