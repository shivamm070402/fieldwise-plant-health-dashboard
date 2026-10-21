import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowDown, ArrowRight, CloudSun, Leaf, ScanLine, Smartphone, Sprout } from 'lucide-react';
import './about.css';

const greenhouseImage = 'https://images.unsplash.com/photo-1601601319316-bace8ae2b548?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1800';
const leafImage = 'https://images.unsplash.com/photo-1561850884-984823f60a81?auto=format&fit=crop&fm=jpg&fit=crop&w=1100&q=85';

export default function AboutPage({ onNavigate, onMobileAccess }) {
  const page = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let observer;
    const context = gsap.context(() => {
      gsap.from('.about-nav, .about-hero-copy > *, .about-hero-image', {
        opacity: 0,
        y: reducedMotion ? 0 : 24,
        duration: reducedMotion ? 0.2 : 0.8,
        stagger: 0.1,
        ease: 'power3.out',
      });

      if (!reducedMotion) {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              gsap.fromTo(entry.target, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.12 });
        page.current?.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
      }
    }, page);
    return () => { observer?.disconnect(); context.revert(); };
  }, []);

  return <main className="about-page" ref={page}>
    <nav className="about-nav" aria-label="About page navigation">
      <button className="about-brand" type="button" onClick={() => onNavigate('overview')}><span><Leaf size={18} /></span> fieldwise<span className="about-brand-dot">.</span></button>
      <div><button type="button" className="about-nav-link about-mobile-button" onClick={onMobileAccess}><Smartphone size={14} /> Open on mobile</button><button type="button" className="about-nav-link" onClick={() => onNavigate('overview')}>Dashboard</button><button type="button" className="about-nav-cta" onClick={() => onNavigate('plant')}>Try a plant scan <ArrowRight size={15} /></button></div>
    </nav>

    <section className="about-hero">
      <div className="about-hero-copy">
        <span className="about-eyebrow"><Sprout size={14} /> PLANT HEALTH, MADE CLEARER</span>
        <h1>Better growing starts with <em>looking closer.</em></h1>
        <p>Fieldwise brings plant photo screening and local weather into one simple workspace—so you can notice changes, understand conditions, and choose your next step with more confidence.</p>
        <div className="about-hero-actions"><button type="button" onClick={() => onNavigate('plant')}>Explore plant detection <ArrowRight size={16} /></button><a href="#how-it-works">How it works <ArrowDown size={15} /></a></div>
        <div className="about-trust"><span><i /> Image-based screening</span><span><i /> Local forecast context</span><span><i /> Guidance, not a diagnosis</span></div>
      </div>
      <figure className="about-hero-image"><img src={greenhouseImage} alt="Rows of leafy plants growing inside a greenhouse" /><figcaption><span>FIELD NOTES · 01</span><b>Healthy fields begin with observation.</b></figcaption><span className="about-image-mark"><Leaf size={23} /></span></figure>
    </section>

    <section className="about-intro" data-reveal>
      <span className="about-eyebrow">A PRACTICAL TOOL FOR EVERY GROWER</span>
      <h2>From a leaf photo to a more informed next step.</h2>
      <p>Plant symptoms can be easy to miss—and weather can change what a crop needs. Fieldwise puts helpful signals side by side without replacing your own experience or local expertise.</p>
    </section>

    <section className="about-workflow" id="how-it-works" aria-label="How Fieldwise works">
      <article data-reveal><span className="about-step">01</span><span className="about-step-icon"><ScanLine size={20} /></span><h3>Capture a clear photo</h3><p>Upload a close, well-lit image of a leaf to get an AI screening prediction for likely crop and visible issue.</p></article>
      <article data-reveal><span className="about-step">02</span><span className="about-step-icon"><CloudSun size={20} /></span><h3>Add local context</h3><p>Check current conditions and a five-day forecast for a selected city, then review weather cues alongside the result.</p></article>
      <article data-reveal><span className="about-step">03</span><span className="about-step-icon"><Sprout size={20} /></span><h3>Choose what to do next</h3><p>Use practical care suggestions as a starting point. Confirm uncertain or severe symptoms with a local specialist.</p></article>
    </section>

    <section className="about-feature" data-reveal>
      <div className="about-feature-image"><img src={leafImage} alt="Close view of a green leaf and its veins" /><span>Small details matter.</span></div>
      <div className="about-feature-copy"><span className="about-eyebrow">BUILT FOR REAL-WORLD GROWING</span><h2>One view for plant signals and field conditions.</h2><p>Get a focused screening, see humidity and rain in context, and compare weather across locations—all in a calm dashboard designed to make the next step easier to find.</p><button type="button" onClick={() => onNavigate('weather')}>Explore the weather dashboard <ArrowRight size={16} /></button></div>
    </section>

    <section className="about-video" data-reveal>
      <div className="about-video-heading"><span className="about-eyebrow">LEARN FROM THE EXPERTS</span><h2>Good scouting starts with good observation.</h2><p>A short educational webinar from the University of Wisconsin–Madison Extension introduces common plant disease signs and symptoms.</p></div>
      <div className="about-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/MowWHHwS1tI?rel=0" title="Strategies for Identifying and Managing Plant Diseases — University of Wisconsin Extension" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /><a href="https://hort.extension.wisc.edu/articles/strategies-for-identifying-and-managing-plant-diseases-2/" target="_blank" rel="noreferrer">Video and learning resource by UW–Madison Extension</a></div>
    </section>

    <section className="about-note" data-reveal><span className="about-note-icon"><Leaf size={21} /></span><div><b>A helpful screening—not a final diagnosis.</b><p>AI predictions can be wrong. Similar symptoms may have different causes, and a single image cannot assess the whole plant. For high-impact decisions, confirm with an agricultural extension service or plant health professional.</p></div><button type="button" onClick={() => onNavigate('plant')}>Start a scan <ArrowRight size={16} /></button></section>

    <footer className="about-footer"><button type="button" onClick={() => onNavigate('overview')} className="about-brand"><span><Leaf size={18} /></span> fieldwise<span className="about-brand-dot">.</span></button><span>Plant health insights for more confident growing.</span><a href="https://unsplash.com/photos/green-leaf-plants-inside-greenhouse-epUhmcUwV-U" target="_blank" rel="noreferrer">Greenhouse image: Kaitlan Balsam / Unsplash</a><a href="https://unsplash.com/photos/closeup-photography-of-green-taro-plant-Sw6U-9HxQnQ" target="_blank" rel="noreferrer">Leaf image: Unsplash</a></footer>
  </main>;
}
