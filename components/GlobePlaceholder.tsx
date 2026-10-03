export function GlobePlaceholder() {
  return (
    <section className="relative flex min-h-[280px] flex-col border-edge bg-panel md:border-x">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
          Encounter globe
        </h2>
        <span className="font-mono text-[11px] text-muted">Phase 2</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
        <div
          aria-hidden
          className="relative h-40 w-40 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #1d4c63 0%, #0e2a38 42%, #081820 70%, #050f14 100%)",
            boxShadow: "inset -18px -12px 30px rgba(0,0,0,0.45), 0 0 40px rgba(121,214,203,0.08)",
          }}
        >
          <div className="absolute inset-6 rounded-full border border-dashed border-accent/30" />
          <div className="absolute top-1/2 left-0 h-px w-full bg-accent/25" />
        </div>
        <p className="max-w-sm text-center text-sm text-muted">
          The live Earth view lands here. Orbit tracks around closest approach are not drawn yet.
        </p>
      </div>
    </section>
  );
}
