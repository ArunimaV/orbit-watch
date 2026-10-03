export function TranscriptPlaceholder() {
  return (
    <section className="flex min-h-[220px] flex-col bg-panel">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
          Transcript
        </h2>
        <span className="font-mono text-[11px] text-muted">Phase 3</span>
      </header>
      <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-4">
        <p className="text-sm leading-relaxed text-muted">
          Voice is not connected. When it is, this panel will show what Orbit Watch says about the
          warnings on the left.
        </p>
        <div className="rounded-md border border-dashed border-edge px-3 py-2 font-mono text-[11px] text-muted">
          mic idle
        </div>
      </div>
    </section>
  );
}
