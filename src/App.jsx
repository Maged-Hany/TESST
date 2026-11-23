import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import MyCalories from './pages/MyCalories.jsx';

function readRoute() {
  const hash = window.location.hash.replace('#', '');
  return hash || 'home';
}

export default function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <>
      <Navbar active={route} />
      <main>
        {route === 'my-calories' ? <MyCalories /> : <Hero />}
      </main>
    </>
  );
}
