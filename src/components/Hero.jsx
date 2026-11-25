import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__beam" aria-hidden="true" />
      <div className="hero__halo" aria-hidden="true" />

      <figure className="hero__figure">
        <img
          src="/images/athlete.png"
          alt="Muscular athlete seen from behind, raising a clenched fist"
          width="493"
          height="998"
          fetchPriority="high"
        />
      </figure>

      <h1 id="hero-title" className="hero__title">
        The body follows the plan.
      </h1>

      <p className="hero__aside">
        We structure every meal and workout
        <br />
        before you step into the gym.
      </p>

      <p className="hero__lede">
        Most people track calories at random and improvise their training.
        <br />
        Foody maps your daily nutrition, organizes your meals, and locks in
        <br />
        your workout schedule — all in one place.
      </p>

      <a className="hero__cta" href="#my-calories">
        <span>Start tracking</span>
        <span className="hero__cta-icon" aria-hidden="true">
          <ArrowRight size={14} strokeWidth={1.75} />
        </span>
      </a>
    </section>
  );
}
