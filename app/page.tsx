import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="flex h-dvh min-h-[640px] flex-col">
      <Dashboard />
      <footer className="border-t border-edge bg-panel px-4 py-2 text-center text-[11px] tracking-wide text-muted uppercase">
        Not for operational use
      </footer>
    </div>
  );
}
