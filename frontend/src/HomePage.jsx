import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowRight, CloudSun, Leaf, ScanLine, Smartphone, Sprout } from 'lucide-react';
import './home.css';

gsap.registerPlugin(ScrollTrigger);

const fieldImage = 'https://images.unsplash.com/photo-1601601319316-bace8ae2b548?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=2200';
const leafImage = 'https://images.unsplash.com/photo-1561850884-984823f60a81?auto=format&fit=crop&fm=jpg&w=1200&q=85';

export default function HomePage({ onDashboard, onMobileAccess }) {
  const page = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro.from('.home-nav', { y: -28, opacity: 0, duration: 0.7 })
        .from('.home-kicker, .home-title-line, .home-description, .home-actions, .home-meta', { y: reducedMotion ? 0 : 32, opacity: 0, duration: reducedMotion ? 0.2 : 0.75, stagger: 0.1 }, '-=.35')
        .from('.home-hero-image', { clipPath: 'inset(18% 10% 18% 10% round 28px)', scale: 1.06, duration: reducedMotion ? 0.2 : 1.2 }, '-=.8');

      if (!reducedMotion) {
        gsap.to('.home-hero-image img', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: true } });
      }

      page.current?.querySelectorAll('[data-home-reveal]').forEach((element) => {
        gsap.from(element, {
          y: reducedMotion ? 0 : 38,
          opacity: 0,
          duration: reducedMotion ? 0.2 : 0.85,
          ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 84%', once: true },
        });
      });
    }, page);
    return () => context.revert();
  }, []);

  return <main className="home-page" ref={page}>
    <header className="home-nav">
      <a className="home-brand" href="#home"><span><Leaf size={19} /></span> FIELDWISE<span className="home-brand-dot">®</span></a>
      <nav aria-label="Main navigation"><a href="#approach">Approach</a><a href="#field-notes">Field notes</a><button className="home-mobile-button" type="button" onClick={onMobileAccess}><Smartphone size={14} /> Open on mobile</button><button type="button" onClick={() => onDashboard('overview')}>Dashboard <ArrowRight size={15} /></button></nav>
    </header>

    <section className="home-hero" id="home">
      <div className="home-hero-copy">
        <span className="home-kicker"><i /> PLANT HEALTH, IN A NEW LIGHT</span>
        <h1><span className="home-title-line">Look closer.</span><span className="home-title-line home-title-accent">Grow forward.</span></h1>
        <p className="home-description">A clearer way to understand plant health—bringing image-based screening and local weather into one field-ready workspace.</p>
        <div className="home-actions"><button type="button" onClick={() => onDashboard('plant')}>Explore the platform <ArrowRight size={16} /></button><a href="#approach">Discover Fieldwise <ArrowDown size={15} /></a></div>
        <div className="home-meta"><span><b>01</b> OBSERVE</span><span><b>02</b> UNDERSTAND</span><span><b>03</b> GROW</span></div>
      </div>
      <div className="home-hero-image"><img src={fieldImage} alt="Abundant green plants growing in a greenhouse" /><div className="home-image-overlay" /><span className="home-image-caption"><i /> GROWING, WITH MORE CONTEXT</span><div className="home-image-index">FIELDWISE <b>01 / 03</b></div><span className="home-image-orbit"><Sprout size={25} /></span></div>
      <div className="home-side-label">PLANT SIGNALS <span>×</span> WEATHER CONTEXT</div>
    </section>

    <div className="home-marquee" aria-label="Observe, understand, grow"><div>OBSERVE <i>✳</i> UNDERSTAND <i>✳</i> GROW WITH CONFIDENCE <i>✳</i> OBSERVE <i>✳</i> UNDERSTAND <i>✳</i> GROW WITH CONFIDENCE <i>✳</i></div></div>

    <section className="home-approach" id="approach" data-home-reveal>
      <div className="home-section-index"><span>01 / THE APPROACH</span><span>FIELD INTELLIGENCE FOR EVERY GROWER</span></div>
      <div className="home-approach-grid"><h2>Healthy plants<br />start with <em>attention.</em></h2><div><p>Every leaf has a story. Fieldwise helps bring its visible signals together with the conditions around it—so it’s easier to know what to look at next.</p><button type="button" onClick={() => onDashboard('plant')}>Meet your plant workspace <ArrowRight size={15} /></button></div></div>
      <div className="home-approach-image"><img src={leafImage} alt="Fine veins of a green leaf illuminated by natural light" /><span>DETAIL IS A GOOD PLACE TO START.</span><b>Notice more.<br />Decide with care.</b></div>
    </section>

    <section className="home-capabilities" data-home-reveal>
      <div className="home-section-index"><span>02 / THE TOOLKIT</span><span>THREE USEFUL PERSPECTIVES</span></div>
      <div className="home-capability-heading"><h2>From a single leaf<br />to the bigger picture.</h2><p>Practical signals, clear context, thoughtful next steps.</p></div>
      <div className="home-capability-grid">
        <article className="home-capability-card home-card-scan"><span className="home-card-number">01 — SEE</span><span className="home-capability-icon"><ScanLine /></span><h3>Plant screening</h3><p>Upload a clear leaf photo to surface a likely crop and visible issue for review.</p><button type="button" onClick={() => onDashboard('plant')} aria-label="Open plant screening"><ArrowRight /></button><div className="home-scan-lines"><i /><i /><i /><i /><i /></div></article>
        <article className="home-capability-card home-card-weather"><span className="home-card-number">02 — SENSE</span><span className="home-capability-icon"><CloudSun /></span><h3>Weather context</h3><p>Read local conditions and the five-day outlook alongside plant-health cues.</p><button type="button" onClick={() => onDashboard('weather')} aria-label="Open local weather"><ArrowRight /></button><div className="home-weather-sun" /></article>
        <article className="home-capability-card home-card-guidance"><span className="home-card-number">03 — ACT</span><span className="home-capability-icon"><Sprout /></span><h3>Care guidance</h3><p>Review practical suggestions, with reminders to confirm uncertain symptoms.</p><button type="button" onClick={() => onDashboard('plant')} aria-label="Open care guidance"><ArrowRight /></button><div className="home-guidance-mark">GROW<br />WITH<br />CARE.</div></article>
      </div>
      <p className="home-disclaimer">Fieldwise provides informational image screening—not a laboratory diagnosis or a substitute for local agricultural advice.</p>
    </section>

    <section className="home-field-notes" id="field-notes" data-home-reveal>
      <div className="home-notes-copy"><span className="home-kicker"><i /> FIELD NOTES · 03</span><h2>The best next step begins with a <em>better question.</em></h2><p>Look at more than one leaf. Notice the weather. Then use a local expert when the stakes are high.</p><button type="button" onClick={() => onDashboard('overview')}>Open Fieldwise dashboard <ArrowRight size={16} /></button></div>
      <div className="home-notes-photo"><img src={fieldImage} alt="Sunlit rows of a greenhouse crop" /><span>FIELDWISE · GROWER’S GUIDE</span></div>
    </section>

    <footer className="home-footer"><a className="home-brand" href="#home"><span><Leaf size={17} /></span> FIELDWISE<span className="home-brand-dot">®</span></a><span>Plant health insights for more confident growing.</span><button type="button" onClick={() => onDashboard('overview')}>ENTER THE FIELD <ArrowRight size={14} /></button><small>© FIELDWISE · AI SCREENING IS INFORMATIONAL</small></footer>
  </main>;
}
