'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Intersection Observer hook for scroll-triggered animations        */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons                                                  */
/* ------------------------------------------------------------------ */
const Icons = {
  ledger: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M4 4h16v16H4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h16M4 14h16M9 4v16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  courier: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="11" width="7" height="10" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  store: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 9l1-4h16l1 4M3 9h18M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20V13h6v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
      <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-20">
      <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378C7.335 7.818 6.6 9.95 6.44 11.38c.3-.07.6-.1.9-.1 1.82 0 3.3 1.36 3.3 3.17 0 1.81-1.48 3.19-3.3 3.19-.95 0-1.84-.38-2.56-1.06l-.197-.259zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-2.588 1.617-3.323 3.749-3.483 5.179.3-.07.6-.1.9-.1 1.82 0 3.3 1.36 3.3 3.17 0 1.81-1.48 3.19-3.3 3.19-.95 0-1.84-.38-2.56-1.06l-.197-.259z" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Brand logos (SVG text placeholders styled as logos)                */
/* ------------------------------------------------------------------ */
const trustedBrands = ['Daraz', 'Pathao', 'Steadfast', 'bKash', 'Chaldal'];

/* ------------------------------------------------------------------ */
/*  Landing Page                                                      */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navLinks = ['Features', 'Why Us', 'Pricing', 'Testimonials', 'FAQ'];

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  }, []);

  return (
    <div
      className="min-h-screen bg-forest-offwhite font-[var(--font-geist-sans)] text-forest-deep overflow-x-hidden"
      style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}
    >
      {/* ============================================================ */}
      {/*  NAVBAR                                                      */}
      {/* ============================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-forest-dark/95 backdrop-blur-md border-b border-forest-emerald/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-forest-soft flex items-center justify-center text-forest-deep font-black text-sm group-hover:scale-105 transition-transform">
                N
              </div>
              <span className="text-white font-bold text-lg tracking-tight">
                nirvul<span className="text-forest-soft">360</span>
              </span>
            </button>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <button
                  key={link}
                  onClick={() => scrollTo(link.toLowerCase().replace(' ', '-'))}
                  className="text-forest-soft/80 hover:text-white text-sm font-medium transition-colors"
                >
                  {link}
                </button>
              ))}
            </div>

            {/* CTA */}
            <div className="hidden md:flex items-center gap-3">
              <a href="/login" className="text-forest-soft/80 hover:text-white text-sm font-medium transition-colors px-3 py-2">
                Login
              </a>
              <a
                href="/login"
                className="bg-forest-soft text-forest-deep font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-white transition-all hover:shadow-lg hover:shadow-forest-soft/20"
              >
                Start Free
              </a>
            </div>

            {/* Mobile menu button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white p-2">
              {mobileMenuOpen ? Icons.close : Icons.menu}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-forest-dark border-t border-forest-emerald/30 px-4 pb-4">
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={() => scrollTo(link.toLowerCase().replace(' ', '-'))}
                className="block w-full text-left text-forest-soft/80 hover:text-white text-sm font-medium py-3 border-b border-forest-emerald/10"
              >
                {link}
              </button>
            ))}
            <div className="flex gap-3 mt-4">
              <a href="/login" className="text-forest-soft/80 hover:text-white text-sm font-medium py-2.5 px-3">Login</a>
              <a href="/login" className="bg-forest-soft text-forest-deep font-semibold text-sm px-5 py-2.5 rounded-full">Start Free</a>
            </div>
          </div>
        )}
      </nav>

      {/* ============================================================ */}
      {/*  HERO SECTION                                                */}
      {/* ============================================================ */}
      <section className="relative pt-16 overflow-hidden">
        {/* Green cloud-gradient background */}
        <div className="absolute inset-0 bg-forest-dark" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 20%, #05572F80 0%, transparent 70%), radial-gradient(circle at 20% 40%, #025033 0%, transparent 50%), radial-gradient(circle at 80% 30%, #3A806740 0%, transparent 40%)',
          }}
        />

        {/* Decorative floating dots/rings */}
        <div className="absolute top-28 left-[15%] w-2 h-2 rounded-full bg-forest-soft/40 animate-pulse" />
        <div className="absolute top-40 right-[20%] w-3 h-3 rounded-full bg-forest-soft/30 animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute top-64 left-[8%] w-16 h-16 rounded-full border border-forest-soft/10" />
        <div className="absolute top-36 right-[10%] w-24 h-24 rounded-full border border-forest-muted/20" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-20 text-center">
          {/* Badge */}
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-forest-emerald/60 border border-forest-soft/20 text-forest-soft text-xs sm:text-sm font-medium px-4 py-1.5 rounded-full mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Now in Public Beta — Free for 100 orders/mo</span>
            </div>
          </Reveal>

          {/* Headline */}
          <Reveal delay={100}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.1] max-w-5xl mx-auto">
              Automated Accounting Engine for{' '}
              <span className="bg-gradient-to-r from-forest-soft via-emerald-300 to-white bg-clip-text text-transparent">
                Bangladeshi E-Commerce
              </span>
            </h1>
          </Reveal>

          {/* Subtitle */}
          <Reveal delay={200}>
            <p className="mt-6 text-lg sm:text-xl text-forest-soft/80 max-w-2xl mx-auto font-normal leading-relaxed">
              Zero-friction double-entry bookkeeping, real-time courier cashflow tracking, and AI WhatsApp expense
              logging — engineered for F-Commerce merchants.
            </p>
          </Reveal>

          {/* CTA Buttons */}
          <Reveal delay={300}>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-forest-soft text-forest-deep font-bold text-base px-8 py-3.5 rounded-full hover:bg-white hover:shadow-xl hover:shadow-forest-soft/20 transition-all group"
              >
                Start Free — No Card Required
                <span className="group-hover:translate-x-1 transition-transform">{Icons.arrowRight}</span>
              </a>
              <button
                onClick={() => scrollTo('features')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-forest-soft/40 text-forest-soft font-semibold text-base px-8 py-3.5 rounded-full hover:bg-forest-soft/10 transition-colors"
              >
                Book a Demo
              </button>
            </div>
          </Reveal>

          {/* Social proof avatar stack */}
          <Reveal delay={400}>
            <div className="mt-8 flex items-center justify-center gap-3 text-xs sm:text-sm text-forest-soft/60">
              <div className="flex -space-x-2">
                {['🧑‍💼', '👩‍💻', '👨‍💼', '👩‍💼'].map((emoji, i) => (
                  <span key={i} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-forest-emerald border border-forest-soft/30 text-xs">
                    {emoji}
                  </span>
                ))}
              </div>
              <span>Trusted by 500+ Bangladeshi merchants</span>
            </div>
          </Reveal>

          {/* ======================================================== */}
          {/*  HERO DASHBOARD MOCKUP                                   */}
          {/* ======================================================== */}
          <Reveal delay={500} className="mt-14 sm:mt-20">
            <div className="relative mx-auto max-w-5xl rounded-2xl sm:rounded-3xl bg-forest-dark/80 p-2 sm:p-4 border border-forest-soft/20 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-forest-emerald/30 mb-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                </div>
                <div className="flex-1 mx-4 bg-forest-deep/60 rounded-md py-1 px-3 text-[11px] text-forest-soft/50 font-mono text-center truncate">
                  app.nirvul360.com/dashboard
                </div>
              </div>

              {/* Mockup Body */}
              <div className="bg-forest-offwhite rounded-xl sm:rounded-2xl p-4 sm:p-6 text-left text-forest-deep">
                {/* Mock header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-forest-lightgrey gap-2">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-forest-deep">Welcome back, Tamim 👋</h3>
                    <p className="text-xs text-forest-muted">Here&apos;s your financial snapshot for today</p>
                  </div>
                  <span className="self-start sm:self-auto text-xs bg-forest-pale text-forest-deep font-semibold px-3 py-1 rounded-full border border-forest-soft/50">
                    🟢 Live Double-Entry Synced
                  </span>
                </div>

                {/* Metric Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
                  <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-forest-lightgrey shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-forest-muted">Net Profit (Today)</span>
                    <p className="text-xl sm:text-2xl font-black text-forest-deep mt-1">৳45,230</p>
                    <span className="text-[11px] text-emerald-600 font-semibold">↑ 18.2% from yesterday</span>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-forest-lightgrey shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-forest-muted">Today&apos;s Orders</span>
                    <p className="text-xl sm:text-2xl font-black text-forest-deep mt-1">47</p>
                    <span className="text-[11px] text-forest-muted">38 shipped · 9 pending</span>
                  </div>

                  <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-forest-lightgrey shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-forest-muted">Pending COD</span>
                    <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">৳1,24,500</p>
                    <span className="text-[11px] text-forest-muted">Steadfast: ৳82k · Pathao: ৳42.5k</span>
                  </div>
                </div>

                {/* Mini chart & progress bar */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* Revenue Bar Chart */}
                  <div className="bg-white rounded-xl p-4 border border-forest-lightgrey shadow-sm">
                    <span className="text-xs font-bold text-forest-deep">Weekly Revenue Trend</span>
                    <div className="flex items-end gap-2.5 h-20 mt-3 pt-2">
                      {[
                        { day: 'Sat', h: '45%' },
                        { day: 'Sun', h: '65%' },
                        { day: 'Mon', h: '55%' },
                        { day: 'Tue', h: '80%' },
                        { day: 'Wed', h: '70%' },
                        { day: 'Thu', h: '90%' },
                        { day: 'Fri', h: '100%' },
                      ].map((bar) => (
                        <div key={bar.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          <div
                            className="w-full bg-forest-soft rounded-t-md hover:bg-forest-deep transition-colors"
                            style={{ height: bar.h }}
                          />
                          <span className="text-[9px] text-forest-muted">{bar.day}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Status */}
                  <div className="bg-white rounded-xl p-4 border border-forest-lightgrey shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-forest-deep">Delivery Pipeline</span>
                      <div className="space-y-2 mt-2.5">
                        <div>
                          <div className="flex justify-between text-[11px] text-forest-muted mb-0.5">
                            <span>Delivered (COD Collected)</span>
                            <span className="font-bold text-forest-deep">78%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-forest-pale overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-forest-muted mb-0.5">
                            <span>In Transit</span>
                            <span className="font-bold text-forest-deep">16%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-forest-pale overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: '16%' }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-forest-muted mb-0.5">
                            <span>Returned</span>
                            <span className="font-bold text-forest-deep">6%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-forest-pale overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full" style={{ width: '6%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-forest-muted pt-2 border-t border-forest-lightgrey mt-2">
                      Auto-synced via Steadfast &amp; Pathao Webhooks
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Wave divider */}
        <div className="relative -mb-1 text-forest-offwhite">
          <svg viewBox="0 0 1440 80" fill="currentColor" className="w-full h-auto">
            <path d="M0,32L80,42.7C160,53,320,75,480,74.7C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,80L1360,80C1280,80,1120,80,960,80C800,80,640,80,480,80C320,80,160,80,80,80L0,80Z" />
          </svg>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SOCIAL PROOF LOGOS STRIP                                    */}
      {/* ============================================================ */}
      <section className="py-12 bg-forest-offwhite border-b border-forest-lightgrey">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-forest-muted font-bold mb-8">
            Integrated with Bangladesh&apos;s leading e-commerce platforms &amp; couriers
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-60 hover:opacity-100 transition-opacity">
            {trustedBrands.map((brand) => (
              <div key={brand} className="flex items-center gap-2 group cursor-default">
                <div className="w-8 h-8 rounded-lg bg-forest-pale flex items-center justify-center text-forest-deep font-bold text-xs group-hover:bg-forest-soft transition-colors">
                  {brand[0]}
                </div>
                <span className="font-bold text-base sm:text-lg tracking-tight text-forest-deep/80 group-hover:text-forest-deep transition-colors">
                  {brand}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURES BENTO GRID                                         */}
      {/* ============================================================ */}
      <section id="features" className="py-20 sm:py-28 bg-forest-offwhite">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block text-forest-muted bg-forest-pale text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Core Capabilities
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-forest-deep tracking-tight">
                Unlock Premium Benefits With Our Advanced Features
              </h2>
              <p className="text-forest-muted text-lg mt-4 max-w-2xl mx-auto">
                Purpose-built tools designed to tackle the unique financial complexities of Bangladeshi F-Commerce.
              </p>
            </div>
          </Reveal>

          {/* 2x2 Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 1: Double-Entry Ledger */}
            <Reveal delay={100}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl hover:shadow-forest-soft/10 transition-all group h-full flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-forest-pale text-forest-deep flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {Icons.ledger}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-forest-deep">
                    Strict Double-Entry General Ledger
                  </h3>
                  <p className="text-forest-muted text-sm sm:text-base leading-relaxed mt-3">
                    Every sale, expense, and withdrawal produces balanced debits and credits automatically. Fully
                    GAAP-compliant from day one without hiring a full-time accountant.
                  </p>
                </div>

                {/* Mini visual */}
                <div className="mt-6 bg-forest-offwhite rounded-xl p-3 text-xs font-mono border border-forest-lightgrey">
                  <div className="flex justify-between text-forest-muted pb-1 border-b border-forest-lightgrey text-[10px]">
                    <span>Account</span>
                    <span>Debit</span>
                    <span>Credit</span>
                  </div>
                  <div className="flex justify-between py-1 text-forest-deep">
                    <span>1010 Cash on Hand</span>
                    <span>৳1,500</span>
                    <span>—</span>
                  </div>
                  <div className="flex justify-between py-1 text-forest-deep">
                    <span>4010 Product Sales</span>
                    <span>—</span>
                    <span>৳1,500</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 pt-1 font-semibold border-t border-forest-lightgrey">
                    ✓ Balanced: ΔAssets = ΔLiabilities + ΔEquity
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Feature 2: Courier Tracking */}
            <Reveal delay={200}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl hover:shadow-forest-soft/10 transition-all group h-full flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-forest-pale text-forest-deep flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {Icons.courier}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-forest-deep">
                    Courier Cashflow &amp; COD Settlement
                  </h3>
                  <p className="text-forest-muted text-sm sm:text-base leading-relaxed mt-3">
                    Direct integration with Steadfast and Pathao. Webhooks track deliveries, returns, and cash remittances
                    in real time so you never lose track of money held by couriers.
                  </p>
                </div>

                {/* Mini visual */}
                <div className="mt-6 bg-forest-offwhite rounded-xl p-3 text-xs border border-forest-lightgrey space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-forest-deep">Steadfast Consignment #SF-8921</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Delivered</span>
                  </div>
                  <div className="flex justify-between text-forest-muted text-[11px]">
                    <span>Invoice: ৳2,450 · COD Fee: ৳24.50</span>
                    <span className="text-emerald-600 font-bold">Settled: ৳2,425.50</span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Feature 3: WhatsApp Expense Bot */}
            <Reveal delay={100}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl hover:shadow-forest-soft/10 transition-all group h-full flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-forest-pale text-forest-deep flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {Icons.whatsapp}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-forest-deep">
                    WhatsApp AI Expense Logging Bot
                  </h3>
                  <p className="text-forest-muted text-sm sm:text-base leading-relaxed mt-3">
                    Text expenses in Bangla, English, or Banglish (e.g. &ldquo;packaging 500 tk&rdquo; or &ldquo;দোকান ভাড়া ১৫০০০&rdquo;).
                    Powered by OpenAI &amp; regex, with 2-step confirmation before writing to ledger.
                  </p>
                </div>

                {/* Mini visual: Chat mockup */}
                <div className="mt-6 bg-forest-offwhite rounded-xl p-3 border border-forest-lightgrey space-y-2 text-xs">
                  <div className="bg-forest-pale p-2 rounded-lg max-w-[80%] text-forest-deep">
                    packaging 500 tk
                  </div>
                  <div className="bg-white p-2 rounded-lg max-w-[85%] ml-auto border border-forest-lightgrey text-forest-deep text-[11px]">
                    📝 Draft: প্যাকেজিং ৳500.00. Confirm with &quot;হ্যাঁ&quot;?
                  </div>
                  <div className="bg-forest-pale p-1.5 rounded-lg max-w-[50%] text-forest-deep text-center font-bold">
                    হ্যাঁ ✓
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Feature 4: Real-Time P&L */}
            <Reveal delay={200}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl hover:shadow-forest-soft/10 transition-all group h-full flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-forest-pale text-forest-deep flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {Icons.dashboard}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-forest-deep">
                    Real-Time P&amp;L &amp; Net Margin Engine
                  </h3>
                  <p className="text-forest-muted text-sm sm:text-base leading-relaxed mt-3">
                    COGS calculated automatically on every delivered parcel. Operating expenses subtracted in real time.
                    Know your exact daily net profit and never sell at a loss again.
                  </p>
                </div>

                {/* Mini visual */}
                <div className="mt-6 bg-forest-offwhite rounded-xl p-3 border border-forest-lightgrey space-y-1 text-xs">
                  <div className="flex justify-between text-forest-deep font-semibold">
                    <span>Delivered Gross Sales</span>
                    <span>৳1,84,500</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Less: COGS (Cost of Goods)</span>
                    <span>-৳92,000</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Less: Courier + Operating Exp</span>
                    <span>-৳41,200</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-black pt-1 border-t border-forest-lightgrey text-sm">
                    <span>Confirmed Net Profit</span>
                    <span>৳51,300 (27.8%)</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATS SECTION                                               */}
      {/* ============================================================ */}
      <section id="why-us" className="py-20 sm:py-28 bg-forest-dark relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, #05572F50 0%, transparent 70%)' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block text-forest-soft bg-forest-emerald text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Proven Impact
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                Why Merchants Choose Nirvul360
              </h2>
              <p className="text-forest-soft/70 text-lg mt-4 max-w-xl mx-auto">
                Numbers that reflect real growth, operational efficiency, and financial control.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {[
              { stat: '40%', label: 'Reduction in Unrecorded Petty Cash', desc: 'WhatsApp bot captures every tape, bag, and tea expense', emoji: '📉' },
              { stat: '3x', label: 'Faster Monthly Bookkeeping', desc: 'No more weekend spreadsheet reconciliations', emoji: '⚡' },
              { stat: '100%', label: 'Double-Entry Invariant Compliance', desc: 'Debits always match credits. Guaranteed.', emoji: '⚖️' },
              { stat: '10k+', label: 'Courier Orders Tracked', desc: 'Across Steadfast & Pathao pipelines monthly', emoji: '📦' },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 100}>
                <div className="bg-forest-deep/60 rounded-2xl p-6 sm:p-8 border border-forest-soft/10 text-center hover:border-forest-soft/30 transition-all group">
                  <span className="text-2xl mb-2 block">{s.emoji}</span>
                  <p className="text-4xl sm:text-5xl font-black text-white tracking-tight group-hover:scale-105 transition-transform">
                    {s.stat}
                  </p>
                  <p className="text-sm font-bold text-forest-soft mt-3 mb-1">{s.label}</p>
                  <p className="text-xs text-forest-soft/60 leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS (STEPS)                                        */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-28 bg-forest-offwhite">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block text-forest-muted bg-forest-pale text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Onboarding
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-forest-deep tracking-tight">
                Get Started in Just 3 Easy Steps
              </h2>
              <p className="text-forest-muted text-lg mt-4 max-w-xl mx-auto">
                No complex ERP setup. Up and running in less than 5 minutes.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-forest-soft via-forest-muted to-forest-soft -translate-y-8 z-0" />

            {[
              {
                step: '01',
                title: 'Connect Your Store & Couriers',
                desc: 'Hook up your WooCommerce, Shopify, Steadfast, and Pathao API keys with one click.',
                icon: Icons.store,
              },
              {
                step: '02',
                title: 'Track Orders & Expenses',
                desc: 'Parcels sync automatically. Log expenses via WhatsApp in casual Bangla.',
                icon: Icons.truck,
              },
              {
                step: '03',
                title: 'See True Net Profit',
                desc: 'Watch your real daily profits, margins, and courier receivables calculate automatically.',
                icon: Icons.chart,
              },
            ].map((s, i) => (
              <Reveal key={s.step} delay={i * 150}>
                <div className="relative text-center group">
                  {/* Step circle */}
                  <div className="relative mx-auto w-14 h-14 rounded-2xl bg-forest-deep text-forest-soft flex items-center justify-center mb-6 group-hover:bg-forest-emerald transition-colors shadow-lg shadow-forest-deep/20 z-10">
                    {s.icon}
                  </div>
                  <span className="text-xs font-bold text-forest-muted tracking-widest uppercase">Step {s.step}</span>
                  <h3 className="text-lg font-bold text-forest-deep mt-2 mb-3">{s.title}</h3>
                  <p className="text-forest-muted text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  TESTIMONIALS                                                */}
      {/* ============================================================ */}
      <section id="testimonials" className="py-20 sm:py-28 bg-forest-pale/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block text-forest-muted bg-forest-pale text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Testimonials
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-forest-deep tracking-tight">
                Real Results, Real Impact
              </h2>
              <p className="text-forest-muted text-lg mt-4 max-w-xl mx-auto">
                See how Bangladeshi merchants are transforming their accounting with Nirvul360.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Tamim Ahmed',
                role: 'Owner, Artisan Wear BD',
                quote: 'Before Nirvul360, I had no idea where my money was going. Now I see exact net profit every single day.',
                emoji: '👨‍💼',
              },
              {
                name: 'Nusrat Jahan',
                role: 'Manager, GlowUp Cosmetics',
                quote: 'The WhatsApp bot is a game-changer. My staff logs packaging and transport costs without opening any app.',
                emoji: '👩‍💻',
              },
              {
                name: 'Rafiq Hasan',
                role: 'Founder, TechZone BD',
                quote: 'Finally, an accounting tool that understands Bangladeshi courier workflows. Steadfast + Pathao tracking is flawless.',
                emoji: '🧑‍💼',
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-forest-lightgrey hover:shadow-lg hover:shadow-forest-soft/10 transition-all h-full flex flex-col">
                  {/* Stars */}
                  <div className="flex gap-0.5 text-amber-400 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <span key={j}>{Icons.star}</span>
                    ))}
                  </div>

                  {/* Quote */}
                  <div className="relative flex-1">
                    <div className="absolute -top-1 -left-1 text-forest-soft">{Icons.quote}</div>
                    <p className="text-forest-deep leading-relaxed pl-6">&ldquo;{t.quote}&rdquo;</p>
                  </div>

                  {/* Author */}
                  <div className="flex items-center gap-3 mt-6 pt-6 border-t border-forest-lightgrey">
                    <div className="w-10 h-10 rounded-full bg-forest-pale flex items-center justify-center text-lg">
                      {t.emoji}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-forest-deep">{t.name}</p>
                      <p className="text-xs text-forest-muted">{t.role}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING SECTION                                             */}
      {/* ============================================================ */}
      <section id="pricing" className="py-20 sm:py-28 bg-forest-offwhite relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-12">
              <span className="inline-block text-forest-muted bg-forest-pale text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Pricing Plans
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-forest-deep tracking-tight">
                Simple, Transparent Pricing
              </h2>
              <p className="text-forest-muted text-lg mt-4 max-w-xl mx-auto">
                No hidden costs. Designed specifically for Bangladeshi F-Commerce and E-Commerce scale.
              </p>

              {/* Monthly / Yearly Switcher */}
              <div className="inline-flex items-center gap-2 p-1.5 bg-forest-lightgrey/60 rounded-full mt-8 border border-forest-lightgrey">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-full transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-forest-deep text-white shadow-sm'
                      : 'text-forest-muted hover:text-forest-deep'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-full transition-all flex items-center gap-1.5 ${
                    billingCycle === 'yearly'
                      ? 'bg-forest-deep text-white shadow-sm'
                      : 'text-forest-muted hover:text-forest-deep'
                  }`}
                >
                  <span>Yearly Billing</span>
                  <span className="text-[10px] font-extrabold uppercase bg-forest-soft text-forest-deep px-2 py-0.5 rounded-full">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* 1. Starter */}
            <Reveal delay={100}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="inline-block text-xs font-bold text-forest-muted bg-forest-pale px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                    Starter
                  </div>
                  <h3 className="text-2xl font-black text-forest-deep">ফ্রি (Free)</h3>
                  <p className="text-forest-muted text-sm mt-2">
                    For emerging F-Commerce &amp; solo online shops starting out.
                  </p>

                  <div className="mt-6 mb-6">
                    <span className="text-4xl font-black text-forest-deep">৳০</span>
                    <span className="text-forest-muted text-sm ml-1.5">/ lifetime</span>
                  </div>

                  <ul className="space-y-3.5 pt-4 border-t border-forest-lightgrey text-sm">
                    {[
                      'Up to 100 orders / month',
                      'Double-entry General Ledger core',
                      'Manual POS & Expense logging',
                      'Real-time P&L statement',
                      '1 Admin user account',
                      'Community & Docs support',
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-3 text-forest-deep">
                        <span className="text-forest-emerald mt-0.5 shrink-0">{Icons.check}</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="/login"
                  className="mt-8 w-full block text-center py-3.5 px-6 rounded-2xl border-2 border-forest-deep text-forest-deep font-bold text-sm hover:bg-forest-deep hover:text-white transition-all shadow-xs"
                >
                  Get Started Free
                </a>
              </div>
            </Reveal>

            {/* 2. Growth (Featured) */}
            <Reveal delay={200}>
              <div className="bg-white rounded-3xl p-8 border-2 border-forest-deep shadow-2xl relative h-full flex flex-col justify-between ring-4 ring-forest-soft/30">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-forest-deep text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">
                  Most Popular
                </div>
                <div>
                  <div className="inline-block text-xs font-bold text-forest-deep bg-forest-soft px-3 py-1 rounded-full uppercase tracking-wider mb-4 mt-2">
                    Growth Pro
                  </div>
                  <h3 className="text-2xl font-black text-forest-deep">গ্রোথ (Growth)</h3>
                  <p className="text-forest-muted text-sm mt-2">
                    For fast-scaling brands with active daily courier deliveries.
                  </p>

                  <div className="mt-6 mb-6">
                    <span className="text-4xl font-black text-forest-deep">
                      {billingCycle === 'monthly' ? '৳১,৪৯০' : '৳১,১৯০'}
                    </span>
                    <span className="text-forest-muted text-sm ml-1.5">/ month</span>
                  </div>

                  <ul className="space-y-3.5 pt-4 border-t border-forest-lightgrey text-sm">
                    {[
                      'Unlimited orders & transactions',
                      'Steadfast & Pathao courier auto-sync',
                      'AI WhatsApp Expense Bot (Bangla + Eng)',
                      'Live COGS, Cashflow & Net Margin engine',
                      '5 Team accounts with role permissions',
                      'Bulk CSV Excel order & product imports',
                      'Priority WhatsApp customer support',
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-3 text-forest-deep font-medium">
                        <span className="text-forest-emerald mt-0.5 shrink-0">{Icons.check}</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="/login"
                  className="mt-8 w-full block text-center py-4 px-6 rounded-2xl bg-forest-deep text-white font-bold text-sm hover:bg-forest-emerald transition-all shadow-lg shadow-forest-deep/20 hover:scale-[1.02]"
                >
                  Start 14-Day Free Trial
                </a>
              </div>
            </Reveal>

            {/* 3. Enterprise */}
            <Reveal delay={300}>
              <div className="bg-white rounded-3xl p-8 border border-forest-lightgrey shadow-sm hover:shadow-xl transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="inline-block text-xs font-bold text-forest-muted bg-forest-pale px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                    Enterprise
                  </div>
                  <h3 className="text-2xl font-black text-forest-deep">এজেন্সি (Agency)</h3>
                  <p className="text-forest-muted text-sm mt-2">
                    For multi-brand retailers, agencies, and high-volume merchant groups.
                  </p>

                  <div className="mt-6 mb-6">
                    <span className="text-4xl font-black text-forest-deep">
                      {billingCycle === 'monthly' ? '৳৩,৯৯০' : '৳৩,১৯০'}
                    </span>
                    <span className="text-forest-muted text-sm ml-1.5">/ month</span>
                  </div>

                  <ul className="space-y-3.5 pt-4 border-t border-forest-lightgrey text-sm">
                    {[
                      'Everything in Growth Pro',
                      'Multi-store & Multi-tenant hierarchy',
                      'Store webhooks (WooCommerce, Shopify)',
                      'Unlimited staff & complete audit logs',
                      'Custom chart of accounts configuration',
                      'Dedicated account manager & migration',
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-3 text-forest-deep">
                        <span className="text-forest-emerald mt-0.5 shrink-0">{Icons.check}</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="/login"
                  className="mt-8 w-full block text-center py-3.5 px-6 rounded-2xl border-2 border-forest-deep text-forest-deep font-bold text-sm hover:bg-forest-deep hover:text-white transition-all shadow-xs"
                >
                  Contact Sales &amp; Onboard
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FAQ SECTION                                                 */}
      {/* ============================================================ */}
      <section id="faq" className="py-20 sm:py-28 bg-white border-t border-forest-lightgrey">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block text-forest-muted bg-forest-pale text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                FAQ
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-forest-deep tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-forest-muted text-lg mt-4 max-w-xl mx-auto">
                Everything you need to know about automated accounting with Nirvul360.
              </p>
            </div>
          </Reveal>

          <div className="space-y-4">
            {[
              {
                q: 'How does the WhatsApp AI expense logging bot work?',
                a: "You or your floor staff simply send a text on WhatsApp in Bangla, Banglish, or English (e.g. 'packaging 500 tk' or 'দোকান ভাড়া ১৫০০০ টাকা'). Our AI engine extracts the amount and category, prepares a draft, and asks for a simple 'হ্যাঁ' confirmation before posting balanced double-entry journals into your ledger.",
              },
              {
                q: 'Which Bangladeshi courier services are integrated?',
                a: 'Nirvul360 natively supports Steadfast and Pathao Courier with automated webhooks. Statuses (Delivered, Returned, In Transit) and COD settlements sync straight into your ledger, preventing uncollected money from slipping through the cracks.',
              },
              {
                q: 'Do I need accounting or bookkeeping experience to use this?',
                a: 'Not at all. Nirvul360 is built specifically for business owners, not accountants. Complex debit-credit rules and COGS accounting run automatically behind the scenes. You see straightforward business figures: Real Net Profit, Cash on Hand, and Courier Receivables.',
              },
              {
                q: 'Can I import my existing product and historical sales data?',
                a: 'Yes. We provide easy Excel and CSV templates for bulk importing your products, inventory levels, suppliers, and historical orders in a few clicks.',
              },
              {
                q: 'Is my financial data safe and private?',
                a: 'Strictly isolated. Each merchant operates in an encrypted multi-tenant PostgreSQL database with Row-Level Security (RLS). Your business numbers, profit margins, and customer data are completely confidential and protected.',
              },
            ].map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <Reveal key={faq.q} delay={idx * 60}>
                  <div className="border border-forest-lightgrey rounded-2xl overflow-hidden transition-all bg-forest-offwhite">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full text-left p-6 flex items-center justify-between gap-4 font-bold text-base sm:text-lg text-forest-deep hover:text-forest-emerald transition-colors"
                    >
                      <span>{faq.q}</span>
                      <span className={`transform transition-transform text-forest-muted shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                        {Icons.chevronDown}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-6 pt-1 text-forest-muted text-sm sm:text-base leading-relaxed border-t border-forest-lightgrey/50">
                        {faq.a}
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CTA FOOTER                                                  */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-forest-dark" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 50%, #05572F60 0%, transparent 70%)' }} />

        {/* Decorative */}
        <div className="absolute top-10 left-[10%] w-40 h-40 rounded-full border border-forest-soft/10" />
        <div className="absolute bottom-10 right-[10%] w-32 h-32 rounded-full border border-forest-muted/10" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mb-6">
              Ready to See Your True Profit?
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-forest-soft/70 text-lg mb-10 max-w-xl mx-auto">
              Join 500+ Bangladeshi merchants who switched from spreadsheet chaos to automated double-entry accounting.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 bg-forest-soft text-forest-deep font-bold text-base px-10 py-4 rounded-full hover:bg-white hover:shadow-xl hover:shadow-forest-soft/20 transition-all group"
              >
                Start Free — No Credit Card
                <span className="group-hover:translate-x-1 transition-transform">{Icons.arrowRight}</span>
              </a>
              <button
                onClick={() => scrollTo('features')}
                className="inline-flex items-center justify-center gap-2 border-2 border-forest-soft/30 text-forest-soft font-semibold text-base px-10 py-4 rounded-full hover:border-forest-soft/60 hover:bg-forest-soft/5 transition-all"
              >
                Book a Demo
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="bg-forest-dark border-t border-forest-emerald/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-forest-soft flex items-center justify-center text-forest-deep font-black text-sm">
                  N
                </div>
                <span className="text-white font-bold text-lg tracking-tight">
                  nirvul<span className="text-forest-soft">360</span>
                </span>
              </div>
              <p className="text-forest-soft/50 text-sm leading-relaxed">
                Automated accounting engine built for Bangladeshi e-commerce merchants.
              </p>
            </div>

            {/* Links */}
            {[
              {
                title: 'Product',
                links: ['Features', 'Pricing', 'Integrations', 'API Docs'],
              },
              {
                title: 'Company',
                links: ['About', 'Blog', 'Careers', 'Contact'],
              },
              {
                title: 'Legal',
                links: ['Privacy Policy', 'Terms of Service', 'Refund Policy'],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-semibold text-sm mb-4">{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-forest-soft/50 hover:text-forest-soft text-sm transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-8 border-t border-forest-emerald/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-forest-soft/40 text-sm">
              © {new Date().getFullYear()} Nirvul360. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              {/* Social icons */}
              {[
                {
                  label: 'Facebook',
                  path: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z',
                },
                {
                  label: 'Twitter',
                  path: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z',
                },
                {
                  label: 'LinkedIn',
                  path: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z',
                },
              ].map((s) => (
                <a key={s.label} href="#" aria-label={s.label} className="text-forest-soft/40 hover:text-forest-soft transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
                    <path d={s.path} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
