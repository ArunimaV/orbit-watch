import { Dashboard } from "@/components/Dashboard";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <div className="flex h-dvh min-h-[640px] flex-col">
      <Dashboard />
      <SiteFooter />
    </div>
  );
}
