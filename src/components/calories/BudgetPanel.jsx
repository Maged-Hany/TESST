import { MEAL_TYPES, GOAL_LABELS, formatNumber, mealLabel } from '../../lib/meals.js';
import { toDateString } from '../../lib/dates.js';

const MACROS = [
  { key: 'protein_g', label: 'Protein' },
  { key: 'carbs_g', label: 'Carbs' },
  { key: 'fat_g', label: 'Fat' },
];

function Macro({ label, value, target }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target;
  const diff = Math.abs(Math.round(target - value));

  return (
    <div className={`mc-macro ${over ? 'is-over' : ''}`}>
      <div className="mc-macro__head">
        <span className="mc-macro__name">{label}</span>
        <span className="mc-macro__state">{over ? `${diff} g over` : `${diff} g left`}</span>
      </div>
      <div
        className="mc-macro__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)} of ${target} grams`}
      >
        <span className="mc-macro__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="mc-macro__figures tabular">
        <strong>{Math.round(value)}</strong> of {target} g
      </p>
    </div>
  );
}

// The day bar: one segment per meal time, sized by its Calories against the
// target. The tick marks the target; anything past it turns crimson.
function DayBar({ date, meals, consumed, target }) {
  const totals = MEAL_TYPES.map(({ value }) => ({
    type: value,
    calories: (meals[value] || []).reduce((sum, item) => sum + Number(item.calories || 0), 0),
  }));
  const scale = Math.max(target, consumed, 1);
  const targetPct = (target / scale) * 100;
  const overPct = consumed > target ? ((consumed - target) / scale) * 100 : 0;
  const filled = totals.filter((t) => t.calories > 0);

  return (
    <div className="mc-daybar">
      <div
        className="mc-daybar__track"
        role="img"
        aria-label={`${formatNumber(consumed)} of ${formatNumber(target)} Calories. ${filled
          .map((t) => `${mealLabel(t.type)} ${formatNumber(t.calories)}`)
          .join(', ')}`}
      >
        <div className="mc-daybar__segments" key={date}>
          {filled.map((t, i) => (
            <span
              key={t.type}
              className={`mc-daybar__seg mc-swatch--${t.type}`}
              style={{ width: `${(t.calories / scale) * 100}%`, '--i': i }}
            />
          ))}
        </div>
        {overPct > 0 && (
          <span className="mc-daybar__over" style={{ left: `${targetPct}%`, width: `${overPct}%` }} />
        )}
        <span className="mc-daybar__tick" style={{ left: `${targetPct}%` }} />
      </div>
      <p className="mc-daybar__target tabular" style={{ '--at': `${targetPct}%` }}>
        Target {formatNumber(target)}
      </p>

      {filled.length > 0 ? (
        <ul className="mc-daybar__legend">
          {filled.map((t) => (
            <li key={t.type}>
              <span className={`mc-swatch mc-swatch--${t.type}`} aria-hidden="true" />
              {mealLabel(t.type)} <strong className="tabular">{formatNumber(t.calories)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mc-daybar__empty">Nothing logged yet. Your day fills in here as you add meals.</p>
      )}
    </div>
  );
}

export default function BudgetPanel({ status, data, profile, error, onRetry, onEditProfile }) {
  if (status === 'loading' || !data) {
    if (status === 'error') {
      return (
        <section className="mc-budget" aria-labelledby="mc-budget-title">
          <h2 id="mc-budget-title" className="sr-only">
            Daily budget
          </h2>
          <div className="mc-problem" role="alert">
            <p>{error || 'This day didn’t load.'}</p>
            <button type="button" className="f-btn-secondary" onClick={onRetry}>
              Try again
            </button>
          </div>
        </section>
      );
    }
    return (
      <section className="mc-budget" aria-busy="true" aria-label="Loading daily budget">
        <div className="sk sk--hero" />
        <div className="sk sk--bar" />
        <div className="mc-macros">
          <div className="sk sk--macro" />
          <div className="sk sk--macro" />
          <div className="sk sk--macro" />
        </div>
      </section>
    );
  }

  const { consumed, targets, meals } = data;
  const remaining = targets.calories - consumed.calories;
  const over = remaining < 0;
  const goal = GOAL_LABELS[profile?.goal];

  return (
    <section className="mc-budget" aria-labelledby="mc-budget-title">
      <h2 id="mc-budget-title" className="sr-only">
        Daily budget
      </h2>

      <div className={`mc-remaining ${over ? 'is-over' : ''}`}>
        <p className="mc-remaining__num tabular">{formatNumber(Math.abs(remaining))}</p>
        <p className="mc-remaining__label">
          {over
            ? 'Calories over your target'
            : data.date === toDateString()
            ? 'Calories left today'
            : 'Calories left that day'}
        </p>
      </div>

      <p className="mc-budget__summary tabular">
        You’ve had <strong>{formatNumber(consumed.calories)}</strong> of{' '}
        <strong>{formatNumber(targets.calories)}</strong> Calories
        {goal ? ` on a ${goal} plan.` : '.'}{' '}
        <button type="button" className="mc-text-link" onClick={onEditProfile}>
          Edit body info
        </button>
      </p>

      <DayBar date={data.date} meals={meals} consumed={consumed.calories} target={targets.calories} />

      <div className="mc-macros">
        {MACROS.map((m) => (
          <Macro key={m.key} label={m.label} value={consumed[m.key]} target={targets[m.key]} />
        ))}
      </div>

      {profile && !profile.profile_completed && (
        <div className="mc-setup">
          <p>
            These targets are starting values. Add your weight, height and goal to get targets that
            fit you.
          </p>
          <button type="button" className="f-btn-secondary" onClick={onEditProfile}>
            Add body info
          </button>
        </div>
      )}
    </section>
  );
}
