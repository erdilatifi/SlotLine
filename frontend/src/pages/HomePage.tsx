import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useInView, useReducedMotion } from "motion/react";
import { FadeIn, Stagger, StaggerItem } from "../components/motion";
import { ProductShowcase } from "../components/ProductShowcase";
import {
  ClockTile,
  PipelineTile,
  RaceTile,
  ReminderTile,
  Tile,
} from "../components/landing/BentoCards";
import { Button, Input } from "../components/ui";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/AuthContext";

export function HomePage() {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <Nav />
      <Hero />
      <HowItWorks />
      <Bento />
      <Numbers />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- shell */

const NAV_LINKS = [
  ["How it works", "#how"],
  ["Features", "#features"],
  ["FAQ", "#faq"],
];

function Nav() {
  const { accessToken, loading } = useAuth();
  const signedIn = Boolean(accessToken);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="link-wipe text-sm text-ink-soft transition-colors hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? null : signedIn ? (
            <Link to="/dashboard">
              <Button size="sm">Go to dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Start free</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The email box is the primary action rather than a second-class
 * alternative to a button — typing an address and pressing enter is one
 * gesture, and it carries through to sign-up already filled in.
 */
function Hero() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  function start(e: FormEvent) {
    e.preventDefault();
    navigate(email ? `/register?email=${encodeURIComponent(email)}` : "/register");
  }

  return (
    <section className="relative overflow-x-clip">
      <div className="mx-auto max-w-4xl px-6 pt-20 pb-14 text-center lg:pt-28">
        <FadeIn y={10} onMount>
          <h1 className="text-[2.75rem] leading-[1.04] font-semibold text-balance sm:text-[4rem]">
            Booking that never
            <br />
            <span className="text-accent">double-books.</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.08} onMount>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-balance text-ink-soft">
            Share one link. Clients pick a time that's genuinely free. Two people can never take the
            same slot.
          </p>
        </FadeIn>

        <FadeIn delay={0.16} onMount>
          <form onSubmit={start} className="mx-auto mt-9 flex max-w-md flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="you@yourshop.com"
              aria-label="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 flex-1"
            />
            <Button type="submit" size="lg" className="shrink-0">
              Create your page
            </Button>
          </form>
        </FadeIn>

        <FadeIn delay={0.22} onMount>
          <p className="mt-4 text-[13px] text-muted">
            Free forever · No card · No per-booking fees
          </p>
        </FadeIn>
      </div>

      <FadeIn delay={0.2} y={20} onMount>
        <div className="mx-auto max-w-5xl px-6 pb-24">
          <ProductShowcase />
        </div>
      </FadeIn>
    </section>
  );
}

/* -------------------------------------------------------- how it works */

function HowItWorks() {
  return (
    <section id="how" className="border-y border-line bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn>
          <h2 className="max-w-lg text-3xl font-semibold text-balance sm:text-4xl">
            Running in about five minutes.
          </h2>
        </FadeIn>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { step: "01", title: "Set your hours", visual: <StepHours /> },
            { step: "02", title: "Share your link", visual: <StepLink /> },
            { step: "03", title: "They book themselves", visual: <StepBooked /> },
          ].map((item) => (
            <StaggerItem key={item.step}>
              <div className="h-full overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-center gap-3 px-5 pt-5">
                  <span className="grid size-6 place-items-center rounded-md bg-accent/10 font-mono text-[10px] font-semibold text-accent">
                    {item.step}
                  </span>
                  <p className="text-[15px] font-medium">{item.title}</p>
                </div>
                <div className="p-5">{item.visual}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function StepHours() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
        <span
          key={i}
          className={
            i < 5
              ? "grid h-9 flex-1 place-items-center rounded-md bg-accent text-[12px] font-medium text-white"
              : "grid h-9 flex-1 place-items-center rounded-md border border-line text-[12px] text-muted"
          }
        >
          {day}
        </span>
      ))}
      <p className="mt-2 w-full text-[11px] text-muted">9:00 AM – 5:00 PM, lunch at noon</p>
    </div>
  );
}

function StepLink() {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 10-4.2-4.2l-.6.6M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 104.2 4.2l.6-.6"
            stroke="var(--color-muted)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="truncate font-mono text-[11px]">slotline.app/book/your-shop</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {["Instagram bio", "Google profile", "Text message"].map((place) => (
          <span
            key={place}
            className="rounded-md border border-line px-2 py-1 text-[10px] text-muted"
          >
            {place}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepBooked() {
  return (
    <div className="space-y-1.5">
      {[
        ["9:00", "Sarah Chen", true],
        ["10:30", "Mike Torres", true],
        ["1:00", "Dana Whitfield", false],
      ].map(([time, name, done]) => (
        <div
          key={time as string}
          className="flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2"
        >
          <span className="font-mono text-[11px] text-accent tabular-nums">{time}</span>
          <span className="text-[11px]">{name}</span>
          {done ? (
            <span className="ml-auto text-accent">
              <Check />
            </span>
          ) : (
            <span className="ml-auto text-[10px] text-muted">new</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- features */

/**
 * A bento grid rather than three alternating rows: the tiles are different
 * sizes because the claims are different sizes, and the whole feature set
 * fits on one screen instead of three scrolls.
 */
function Bento() {
  // One listener on the grid feeds the pointer position to whichever tile
  // is under the cursor, instead of a handler per card.
  function trackPointer(event: PointerEvent<HTMLDivElement>) {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".spotlight");
    if (!tile) return;
    const box = tile.getBoundingClientRect();
    tile.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
    tile.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
  }

  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <FadeIn>
        <h2 className="max-w-xl text-3xl font-semibold text-balance sm:text-4xl">
          Built so your schedule holds.
        </h2>
      </FadeIn>

      <div className="mt-12 grid auto-rows-fr gap-4 md:grid-cols-3" onPointerMove={trackPointer}>
        <FadeIn className="md:col-span-2">
          <Tile
            className="h-full"
            eyebrow="Double bookings"
            title="Two people, one slot, one winner."
            body="Two clients can tap the same 2:00 PM in the same second. The second booking simply cannot be saved — so you never find out the hard way."
          >
            <RaceTile />
          </Tile>
        </FadeIn>

        <FadeIn delay={0.05}>
          <Tile
            className="h-full"
            eyebrow="Availability"
            title="Only times you can keep."
            body="Worked out fresh every time someone opens your page — never from a saved list that goes stale."
          >
            <PipelineTile />
          </Tile>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Tile
            className="h-full"
            eyebrow="Clocks"
            title="Nine stays nine."
            body="The weekend the clocks change is where most booking tools quietly break. Yours won't move."
          >
            <ClockTile />
          </Tile>
        </FadeIn>

        <FadeIn delay={0.15}>
          <Tile
            className="h-full"
            eyebrow="No-shows"
            title="A reminder they can act on."
            body="Sent a day ahead in their own timezone, with a link to move or cancel — so they don't just not turn up."
          >
            <ReminderTile />
          </Tile>
        </FadeIn>

        <FadeIn delay={0.2}>
          <Tile
            className="h-full"
            eyebrow="Everything else"
            title="And the rest of it."
            body="Google Calendar both ways. No account for your clients. Several locations from one login. Every change recorded. Email that arrives once, never twice."
          />
        </FadeIn>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- numbers */

/**
 * The middle figure is styled unlike its neighbours on purpose. When three
 * numbers sit in a row people remember the odd one out, and "zero double
 * bookings" is the one worth carrying away.
 */
function Numbers() {
  const stats = [
    { value: 200, label: "people tapping the same time at once" },
    { value: 0, label: "double bookings, ever", hero: true },
    { value: 1, label: "appointment created" },
  ];
  return (
    <section className="border-y border-line bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-center text-sm text-muted">
          What happens when two hundred people want the same slot
        </p>
        <Stagger className="mt-8 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div
                className={
                  stat.hero
                    ? "rounded-2xl border border-accent/25 bg-accent/6 px-6 py-8 text-center"
                    : "rounded-2xl border border-line bg-surface px-6 py-8 text-center"
                }
              >
                <CountUp to={stat.value} />
                <p className="mt-2 text-sm leading-relaxed text-muted">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/** Counts up once, when the number first scrolls into view. Tabular figures
 *  keep the width fixed so the label beneath it doesn't shuffle. */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || reduced || to === 0) {
      if (inView) setValue(to);
      return;
    }
    const start = performance.now();
    const duration = 900;
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, to]);

  return (
    <p ref={ref} className="font-mono text-4xl font-semibold text-accent tabular-nums">
      {value}
    </p>
  );
}

/* ----------------------------------------------------------------- faq */

const FAQ = [
  [
    "Is it really free?",
    "Yes, and not as a trial. There's no payment processing in the product and no per-booking fee.",
  ],
  [
    "Do my clients need an account?",
    "No. They open your link, pick a time, leave a name and email. That's it.",
  ],
  [
    "Can they cancel or move it themselves?",
    "Yes — every confirmation carries a private link to that one appointment. No phone call, no account.",
  ],
  [
    "What if two people book at once?",
    "One gets it. The other sees fresh times immediately — the second booking can't be saved at all.",
  ],
  [
    "Can I use my own calendar?",
    "Connect Google Calendar and your existing events block the time automatically. Bookings flow back out.",
  ],
  [
    "What about daylight saving?",
    "Your hours stay put when the clocks change. Clients always see times in their own zone, labelled.",
  ],
];

function Faq() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <FadeIn>
        <h2 className="text-3xl font-semibold sm:text-4xl">Questions</h2>
      </FadeIn>

      <Stagger className="mt-10 divide-y divide-line border-t border-line">
        {FAQ.map(([q, a]) => {
          const isOpen = open === q;
          return (
            <StaggerItem key={q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : (q ?? null))}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-[15px] font-medium transition-colors hover:text-accent"
                >
                  {q}
                  <span
                    className={`shrink-0 text-xl leading-none text-muted transition-transform duration-300 ${
                      isOpen ? "rotate-45 text-accent" : ""
                    }`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
              </h3>
              <div className={`reveal-grid ${isOpen ? "reveal-open" : ""}`}>
                <div>
                  <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted">{a}</p>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-line bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <FadeIn>
          <h2 className="mx-auto max-w-xl text-4xl font-semibold text-balance sm:text-5xl">
            Give your week back.
          </h2>
          <p className="mx-auto mt-5 max-w-sm leading-relaxed text-ink-soft">
            Share your link and stop answering the phone.
          </p>
          <Link to="/register" className="mt-9 inline-block">
            <Button size="lg">Create your booking page</Button>
          </Link>
          <p className="mt-4 text-[13px] text-muted">Free forever · No card</p>
        </FadeIn>
      </div>
    </section>
  );
}

function Footer() {
  const anchors: Record<string, string> = {
    "How it works": "#how",
    Features: "#features",
    FAQ: "#faq",
  };

  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Appointment booking for people whose hands are busy.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium tracking-[0.1em] text-muted uppercase">Product</p>
          <ul className="mt-4 space-y-2.5">
            {Object.keys(anchors).map((link) => (
              <li key={link}>
                <a
                  href={anchors[link]}
                  className="link-wipe text-sm text-muted transition-colors hover:text-ink"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium tracking-[0.1em] text-muted uppercase">Account</p>
          <ul className="mt-4 space-y-2.5">
            {[
              ["Log in", "/login"],
              ["Create account", "/register"],
            ].map(([label, to]) => (
              <li key={label}>
                <Link
                  to={to!}
                  className="link-wipe text-sm text-muted transition-colors hover:text-ink"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <p className="text-sm text-muted">© {new Date().getFullYear()} Slotline</p>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------- fragments */

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
