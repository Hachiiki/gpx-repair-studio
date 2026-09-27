/**
 * PaceUnitToggle — the §J-2 km/mi segmented control (Task 20
 * extraction: the one implementation the statistics panel and the
 * share view share; previously inline in StatsPanel).
 *
 * Pure presentation: current unit in, change intent out.
 */

export interface PaceUnitToggleProps {
  unit: "km" | "mi";
  onChange: (unit: "km" | "mi") => void;
}

export function PaceUnitToggle({ unit, onChange }: PaceUnitToggleProps) {
  return (
    <div
      className="inline-flex gap-[3px] rounded-[7px] border-[1.25px] border-ink/25 bg-card p-[3px]"
      role="group"
      aria-label="Pace unit"
      data-testid="pace-unit-toggle"
    >
      {(["km", "mi"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={unit === option}
          data-testid={`pace-unit-${option}`}
          className={
            unit === option
              ? "rounded-[4px] bg-signal px-3 py-[4.5px] text-[12.5px] font-semibold text-inkplus"
              : "rounded-[4px] px-3 py-[4.5px] text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground"
          }
          onClick={() => onChange(option)}
        >
          /{option}
        </button>
      ))}
    </div>
  );
}
