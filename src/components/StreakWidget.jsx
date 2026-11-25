export default function StreakWidget({ streak, user, onOpenPopup }) {
  const days = Number(streak?.current_streak || 0);
  const isElite = days > 10;

  return (
    <button
      type="button"
      className={`streak-dock ${isElite ? 'is-elite' : ''}`}
      onClick={onOpenPopup}
      aria-label={`${days} day streak. ${isElite ? 'Elite 10 plus streak badge.' : ''} Click for streak details.`}
    >
      <span className="streak-dock__figure" aria-hidden="true">
        <img src="/images/athlete.png" alt="" width="40" height="81" loading="lazy" />
      </span>
      <span className="streak-dock__body">
        <span className="streak-dock__top">
          <strong className="streak-dock__num tabular">{days}</strong>
          <span className="streak-dock__unit">{days === 1 ? 'day streak' : 'day streak'}</span>
        </span>
        <span className="streak-dock__sub">
          {!user
            ? 'Sign in to save streak'
            : isElite
            ? 'Elite 10+ streak'
            : days > 0
            ? 'Active streak'
            : 'Log a workout today'}
        </span>
      </span>
    </button>
  );
}
