import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MEAL_TYPES, formatNumber } from '../../lib/meals.js';

function MealRow({ item, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await onDelete(item.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className={`mc-row ${item.image_url ? 'has-photo' : ''}`}>
      {item.image_url && (
        <img className="mc-row__photo" src={item.image_url} alt="" loading="lazy" width="56" height="56" />
      )}

      <div className="mc-row__main">
        <h4 className="mc-row__name">{item.food_name}</h4>
        <p className="mc-row__macros tabular">
          <span>
            <strong>{Math.round(item.protein_g)}</strong> g protein
          </span>
          <span>
            <strong>{Math.round(item.carbs_g)}</strong> g carbs
          </span>
          <span>
            <strong>{Math.round(item.fat_g)}</strong> g fat
          </span>
        </p>
      </div>

      <p className="mc-row__cal tabular">
        {formatNumber(item.calories)}
        <span className="sr-only"> Calories</span>
      </p>

      <div className="mc-row__actions">
        {confirming ? (
          <>
            <button type="button" className="mc-danger-link" disabled={busy} onClick={confirmDelete}>
              {busy ? 'Deleting' : 'Delete'}
            </button>
            <button type="button" className="mc-text-link" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mc-icon-btn mc-icon-btn--quiet"
            aria-label={`Delete ${item.food_name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={15} strokeWidth={1.6} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function MealLog({ status, data, onAdd, onDelete }) {
  if (status === 'error') return null; // the budget panel already shows the error and retry

  if (status === 'loading' || !data) {
    return (
      <section className="mc-log" aria-busy="true" aria-label="Loading meals">
        <div className="sk sk--row" />
        <div className="sk sk--row" />
        <div className="sk sk--row" />
      </section>
    );
  }

  const nothingLogged = data.items.length === 0;

  return (
    <section className="mc-log" aria-labelledby="mc-log-title">
      <h2 id="mc-log-title" className="mc-section-title">
        What you ate
      </h2>

      {nothingLogged && (
        <p className="mc-log__empty">
          No meals for this day. Add one with the form, or use Add beside a meal time below.
        </p>
      )}

      {MEAL_TYPES.map(({ value, label }) => {
        const items = data.meals[value] || [];
        const subtotal = items.reduce((sum, i) => sum + Number(i.calories || 0), 0);

        return (
          <div key={value} className="mc-group" role="group" aria-labelledby={`mc-group-${value}`}>
            <div className="mc-group__head">
              <span className={`mc-swatch mc-swatch--${value}`} aria-hidden="true" />
              <h3 id={`mc-group-${value}`} className="mc-group__title">
                {label}
              </h3>
              <p className="mc-group__total tabular">
                {items.length > 0 ? `${formatNumber(subtotal)} Calories` : ''}
              </p>
              <button type="button" className="mc-add" onClick={() => onAdd(value)}>
                <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Add</span>
                <span className="sr-only"> {label.toLowerCase()}</span>
              </button>
            </div>

            {items.length > 0 && (
              <ul className="mc-rows">
                {items.map((item) => (
                  <MealRow key={item.id} item={item} onDelete={onDelete} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
