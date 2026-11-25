import { useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import MyCalories from './pages/MyCalories.jsx';
import Workouts from './pages/Workouts.jsx';
import MealPlan from './pages/MealPlan.jsx';
import Account from './pages/Account.jsx';
import StreakWidget from './components/StreakWidget.jsx';
import StreakPopup from './components/StreakPopup.jsx';
import { api } from './lib/api.js';
import { getAuthToken, setAuthToken } from './lib/auth.js';
import { toDateString } from './lib/dates.js';
import './styles/my-calories.css';
import './styles/pages.css';

const TITLES = {
  home: 'Foody',
  workouts: 'Workouts — Foody',
  'meal-plan': 'Meal Plan — Foody',
  'my-calories': 'My Calories — Foody',
  account: 'Account — Foody',
};

function readRoute() {
  const hash = window.location.hash.replace('#', '');
  return hash || 'home';
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [user, setUser] = useState(null);
  const [streak, setStreak] = useState({ current_streak: 0, longest_streak: 0, is_elite: false, week: [] });
  const [streakPopup, setStreakPopup] = useState({ open: false, celebration: false });

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = TITLES[route] || TITLES.home;
  }, [route]);

  const handleStreakUpdate = useCallback((nextStreak, forceOpenIfExtended = true) => {
    if (!nextStreak) return;
    setStreak(nextStreak);
    if (forceOpenIfExtended && nextStreak.streak_extended) {
      setStreakPopup({ open: true, celebration: true });
    }
  }, []);

  // Restore account session & check daily login streak
  useEffect(() => {
    const today = toDateString();
    const token = getAuthToken();
    if (token) {
      api(`/api/auth/me?check_in=1&date=${encodeURIComponent(today)}`)
        .then((res) => {
          setUser(res.user);
          handleStreakUpdate(res.streak, true);
        })
        .catch(() => {
          setAuthToken('');
          setUser(null);
          api(`/api/streak?date=${encodeURIComponent(today)}`)
            .then(setStreak)
            .catch(() => {});
        });
    } else {
      api(`/api/streak?date=${encodeURIComponent(today)}`)
        .then(setStreak)
        .catch(() => {});
    }
  }, [handleStreakUpdate]);

  function handleAuthenticated({ token, user: authedUser, streak: nextStreak }) {
    setAuthToken(token);
    setUser(authedUser);
    if (nextStreak) {
      setStreak(nextStreak);
      if (nextStreak.streak_extended) {
        setStreakPopup({ open: true, celebration: true });
      }
    }
  }

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    setAuthToken('');
    setUser(null);
    const today = toDateString();
    api(`/api/streak?date=${encodeURIComponent(today)}`)
      .then(setStreak)
      .catch(() => setStreak({ current_streak: 0, longest_streak: 0, is_elite: false, week: [] }));
  }

  function renderPage() {
    switch (route) {
      case 'workouts':
        return <Workouts user={user} onStreakUpdate={handleStreakUpdate} />;
      case 'meal-plan':
        return <MealPlan user={user} />;
      case 'my-calories':
        return <MyCalories />;
      case 'account':
        return (
          <Account
            user={user}
            streak={streak}
            onAuthenticated={handleAuthenticated}
            onLogout={handleLogout}
            onOpenStreakPopup={() => setStreakPopup({ open: true, celebration: false })}
          />
        );
      default:
        return <Hero />;
    }
  }

  return (
    <>
      <Navbar active={route} user={user} />
      <StreakWidget
        streak={streak}
        user={user}
        onOpenPopup={() => setStreakPopup({ open: true, celebration: false })}
      />
      <main>{renderPage()}</main>
      <StreakPopup
        open={streakPopup.open}
        streak={streak}
        user={user}
        isCelebration={streakPopup.celebration}
        onClose={() => setStreakPopup({ open: false, celebration: false })}
      />
    </>
  );
}
