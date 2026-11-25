import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayOfMonth, formatLongDate, formatShort, shiftDate, weekdayShort } from '../../lib/dates.js';
import { formatNumber } from '../../lib/meals.js';

// Seven days ending at `windowEnd`. Each day carries a thin meter showing how
// much of the calorie target that day used, so patterns are visible at a glance.
export default function WeekStrip({
  selectedDate,
  today,
  windowEnd,
  totals,
  target,
  onSelect,
  onShift,
  onToday,
}) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(windowEnd, i - 6));
  const canGoForward = windowEnd < today;

  return (
    <nav className="mc-week" aria-label="Choose a day">
      <div className="mc-week__bar">
        <span className="mc-week__range">
          {formatShort(days[0])} to {formatShort(days[6])}
        </span>
        {selectedDate !== today && (
          <button type="button" className="mc-text-link" onClick={onToday}>
            Back to today
          </button>
        )}
      </div>

      <div className="mc-week__row">
        <button
          type="button"
          className="mc-icon-btn"
          aria-label="Previous 7 days"
          onClick={() => onShift(-7)}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>

        <ul className="mc-week__days">
          {days.map((day) => {
            const calories = totals[day];
            const known = typeof calories === 'number';
            const pct = known && target ? Math.min(100, (calories / target) * 100) : 0;
            const over = known && target && calories > target;
            const selected = day === selectedDate;

            return (
              <li key={day}>
                <button
                  type="button"
                  className={`mc-day ${selected ? 'is-selected' : ''} ${over ? 'is-over' : ''} ${
                    day === today ? 'is-today' : ''
                  }`}
                  aria-pressed={selected}
                  aria-label={`${formatLongDate(day)}${
                    day === today ? ', today' : ''
                  }. ${known ? `${formatNumber(calories)} Calories logged` : 'No data yet'}`}
                  onClick={() => onSelect(day)}
                >
                  <span className="mc-day__name">{weekdayShort(day)}</span>
                  <span className="mc-day__num tabular">{dayOfMonth(day)}</span>
                  <span className="mc-day__meter" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="mc-icon-btn"
          aria-label="Next 7 days"
          disabled={!canGoForward}
          onClick={() => onShift(7)}
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
