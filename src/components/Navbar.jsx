const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'meal-plan', label: 'Meal Plan' },
  { id: 'my-calories', label: 'MyCalories' },
];

export default function Navbar({ active = 'home', user = null }) {
  const accountLabel = user?.name ? user.name.trim().split(/\s+/)[0] : 'Account';

  return (
    <header className="nav-wrap">
      <nav className="nav" aria-label="Main">
        <ul className="nav__list">
          {LINKS.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="nav__link"
                aria-current={active === link.id ? 'page' : undefined}
              >
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#account"
              className="nav__link"
              aria-current={active === 'account' ? 'page' : undefined}
            >
              {accountLabel}
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
