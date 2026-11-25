import { useEffect, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { weekdayShort } from '../lib/dates.js';

export default function StreakPopup({ open, streak, user, isCelebration, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const days = Number(streak?.current_streak || 0);
  const longest = Number(streak?.longest_streak || days);
  const isElite = days > 10;
  const week = streak?.week || [];

  return (
    <dialog
      ref={dialogRef}
      className={`mc-dialog streak-dialog ${isElite ? 'is-elite' : ''}`}
      aria-labelledby="streak-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="streak-dialog__panel">
        <div className="streak-dialog__emblem" aria-hidden="true">
          <img src="/images/athlete.png" alt="" width="64" height="129" />
        </div>

        <h2 id="streak-dialog-title" className="streak-dialog__title">
          {isCelebration || days > 0 ? 'You got a streak' : 'Start your streak'}
        </h2>

        <p className="streak-dialog__copy">
          {days > 0 ? (
            <>
              <strong className="tabular">
                {days} {days === 1 ? 'day' : 'days'}
              </strong>{' '}
              in a row{user ? ` on ${user.name.split(' ')[0]}’s account` : ''}.
              {longest > days ? ` Longest: ${longest} days.` : ''}
            </>
          ) : (
            'Log a workout or sign in on consecutive days to build your streak. Pass 10 days to unlock the crimson badge.'
          )}
        </p>

        {week.length > 0 && (
          <ul className="streak-dialog__week" aria-label="Last 7 days">
            {week.map((item) => (
              <li
                key={item.date}
                className={`streak-dialog__day ${item.logged ? 'is-logged' : ''}`}
              >
                <span className="streak-dialog__day-name">{weekdayShort(item.date)}</span>
                <span className="streak-dialog__day-mark" aria-hidden="true">
                  {item.logged ? <Check size={12} strokeWidth={2.2} /> : '·'}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!user ? (
          <a
            href="#account"
            className="f-cta streak-dialog__cta"
            onClick={onClose}
          >
            <span>Create account to keep streak</span>
            <span className="f-cta__icon" aria-hidden="true">
              <ArrowRight size={14} strokeWidth={1.75} />
            </span>
          </a>
        ) : (
          <button type="button" className="f-cta streak-dialog__cta" onClick={onClose}>
            <span>Keep going</span>
            <span className="f-cta__icon" aria-hidden="true">
              <ArrowRight size={14} strokeWidth={1.75} />
            </span>
          </button>
        )}
      </div>
    </dialog>
  );
}
