const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'meal-plan', label: 'Meal Plan' },
  { id: 'my-calories', label: 'MyCalories' },
];

export default function Navbar({ active = 'home' }) {
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
        </ul>
      </nav>
    </header>
  );
}
