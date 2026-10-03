import { GlobePlaceholder } from "@/components/GlobePlaceholder";
import { TranscriptPlaceholder } from "@/components/TranscriptPlaceholder";
import { WarningList } from "@/components/WarningList";

export default function Home() {
  return (
    <div className="flex h-dvh min-h-[640px] flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)]">
        <WarningList />
        <GlobePlaceholder />
        <TranscriptPlaceholder />
      </div>
      <footer className="border-t border-edge bg-panel px-4 py-2 text-center text-[11px] tracking-wide text-muted uppercase">
        Not for operational use
      </footer>
    </div>
  );
}
