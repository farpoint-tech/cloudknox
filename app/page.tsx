import {
  Server,
  Shield,
  Terminal,
  Users,
  Laptop,
  Key,
  FolderGit2,
  Settings,
  Mail,
  MonitorCheck,
  ChevronRight,
  Github,
} from "lucide-react";

const scripts = [
  {
    title: "Autopilot Group Tag Bulk Setter",
    description:
      "Massenhafte Zuweisung von Group Tags für Windows Autopilot-Geräte ohne bestehenden Tag.",
    icon: Users,
    category: "Autopilot",
  },
  {
    title: "Device Rename GroupTAG Enhanced",
    description:
      "Dynamische Umbenennung von Intune-Geräten basierend auf GroupTag und Seriennummer.",
    icon: Laptop,
    category: "Intune",
  },
  {
    title: "Enhanced LAPS Diagnostic",
    description:
      "Umfassende Diagnose der Local Administrator Password Solution auf Windows-Geräten.",
    icon: Key,
    category: "Security",
  },
  {
    title: "Entra ID App Creator",
    description:
      "Automatisierte Erstellung von App-Registrierungen und Service Principals in Entra ID.",
    icon: Shield,
    category: "Entra ID",
  },
  {
    title: "Intune DDG AutoCreator Ultimate",
    description:
      "Enterprise-Lösung für automatische Erstellung von Dynamic Device Groups in Intune.",
    icon: FolderGit2,
    category: "Intune",
  },
  {
    title: "OOBE Autopilot Registration",
    description:
      "Registrierung von Geräten im Windows Autopilot-Service während des OOBE-Prozesses.",
    icon: MonitorCheck,
    category: "Autopilot",
  },
  {
    title: "Same DevOps Environment",
    description:
      "Einheitliche PowerShell-Entwicklungsumgebung auf neuen Windows-Geräten einrichten.",
    icon: Settings,
    category: "DevOps",
  },
  {
    title: "Exchange Mailbox Provisioner",
    description:
      "Automatisierte Bereitstellung von Exchange-Postfächern und Verteilergruppen.",
    icon: Mail,
    category: "Exchange",
  },
];

const features = [
  {
    title: "Enterprise-Ready",
    description:
      "Alle Scripts sind für den produktiven Einsatz in Unternehmensumgebungen optimiert.",
    icon: Server,
  },
  {
    title: "Microsoft Graph API",
    description:
      "Native Integration mit Microsoft Graph für moderne Cloud-Verwaltung.",
    icon: Shield,
  },
  {
    title: "Vollständig dokumentiert",
    description:
      "Detaillierte Dokumentation und Beispiele für jeden Anwendungsfall.",
    icon: Terminal,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <FeaturesSection />
        <ScriptsSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Terminal className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            CloudKnox
          </span>
        </div>
        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#scripts"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Scripts
          </a>
          <a
            href="https://github.com/farpoint-tech/cloudknox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 py-24 md:py-32">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Farpoint Technologies
        </div>
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
          PowerShell Scripts für{" "}
          <span className="text-primary">Microsoft Cloud</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Professionelle Automatisierung für Microsoft Intune, Azure AD und
          Entra ID. Enterprise-ready Scripts für die moderne IT-Verwaltung.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="https://github.com/farpoint-tech/cloudknox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Github className="h-5 w-5" />
            Repository ansehen
          </a>
          <a
            href="#scripts"
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            Alle Scripts
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="border-t border-border px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground">
            Warum CloudKnox?
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Entwickelt für IT-Professionals, die zuverlässige Automatisierung
            benötigen.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-card-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScriptsSection() {
  return (
    <section id="scripts" className="border-t border-border px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground">
            Script-Sammlung
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Umfassende PowerShell-Scripts für alle Bereiche der Microsoft
            Cloud-Verwaltung.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {scripts.map((script) => (
            <div
              key={script.title}
              className="group flex gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-card/80"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <script.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-semibold text-card-foreground">
                    {script.title}
                  </h3>
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {script.category}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {script.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground">
          Bereit für moderne IT-Verwaltung?
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
          Alle Scripts sind Open Source und können sofort in Ihrer Umgebung
          eingesetzt werden.
        </p>
        <a
          href="https://github.com/farpoint-tech/cloudknox"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Github className="h-5 w-5" />
          Jetzt starten
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Terminal className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">CloudKnox</span>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Farpoint Technologies. Alle Rechte
          vorbehalten.
        </p>
      </div>
    </footer>
  );
}
