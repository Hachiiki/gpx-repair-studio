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
      className="flex overflow-hidden rounded-md border"
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
              ? "bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
              : "px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          }
          onClick={() => onChange(option)}
        >
          /{option}
        </button>
      ))}
    </div>
  );
}
