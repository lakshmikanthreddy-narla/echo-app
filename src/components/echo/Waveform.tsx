export function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-24 items-center justify-center gap-[3px]" aria-hidden>
      {levels.map((l, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-[height] duration-75 ${
            active ? "bg-primary" : "bg-muted-foreground/40"
          }`}
          style={{
            height: `${Math.max(4, l * 88)}px`,
            boxShadow: active && l > 0.25 ? "0 0 8px var(--primary)" : undefined,
          }}
        />
      ))}
    </div>
  );
}
