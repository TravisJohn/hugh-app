import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Check,
  X,
  Gauge,
  Wallet,
  AlertTriangle,
  Shuffle,
  ExternalLink,
  Workflow,
  ChevronRight,
} from "lucide-react";
import {
  GROUP_LABELS,
  PROVIDER_LABELS,
  type CloudProvider,
  type Service,
} from "@/types/cloud";
import MarginProvider from "@/components/margin/MarginProvider";
import StubButton from "@/components/margin/StubButton";
import ServiceRail from "./ServiceRail";

const PROVIDER_ACCENT: Record<CloudProvider, string> = {
  aws: "text-amber-300",
  gcp: "text-sky-300",
  azure: "text-blue-300",
};

/**
 * A full service write-up, the scoped assistant, and the margin. Reference
 * layout — a normal scrolling page (not an interview screen), two columns on
 * desktop: the rundown on the left, a tabbed rail docked on the right.
 *
 * Still a server component. Only the rail and the ＋ on each heading are
 * client-side; the write-up itself never ships to the browser as JavaScript.
 */
export default function ServiceDetail({
  service, initialNote,
}: {
  service: Service;
  /** This learner's existing margin note, read during the server render. */
  initialNote: string;
}) {
  const accent = PROVIDER_ACCENT[service.provider];

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link
          href="/cloud"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} />
          Cloud Skills
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">
        {/* Title block */}
        <div className={`mb-2 text-xs font-semibold uppercase tracking-widest ${accent}`}>
          {PROVIDER_LABELS[service.provider]}
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {service.name}
        </h1>
        {service.short && (
          <p className="mt-1 text-sm text-slate-500">{service.short}</p>
        )}
        <p className="mt-3 max-w-2xl text-lg text-slate-300">{service.oneLiner}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {service.groups.map((g) => (
            <span
              key={g}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-xs text-slate-400"
            >
              {GROUP_LABELS[g]}
            </span>
          ))}
        </div>

        {/* The provider spans both columns: the pad is docked right, but the
            buttons that feed it sit on the headings on the left. */}
        <MarginProvider
          surface="cloud"
          refId={`${service.provider}/${service.id}`}
          refLabel={service.name}
          refHref={`/cloud/${service.provider}/${service.id}`}
          initialBody={initialNote}
        >
        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          <article className="min-w-0 flex-1 space-y-8">
            {/* What it is */}
            <Section icon={<BookOpen size={16} />} title="What it is">
              <p className="leading-relaxed text-slate-300">{service.whatItIs}</p>
            </Section>

            {/* Where it fits — practical picture + a typical pipeline */}
            {service.inPractice && (
              <Section icon={<Workflow size={16} />} title="Where it fits">
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <p className="leading-relaxed text-slate-300">
                    {service.inPractice.narrative}
                  </p>
                  {service.inPractice.flow && service.inPractice.flow.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Typical pipeline
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {service.inPractice.flow.map((step, i) => {
                          const isThis = i === service.inPractice?.highlight;
                          return (
                            <span key={i} className="flex items-center gap-1.5">
                              <span
                                className={`rounded-lg border px-2.5 py-1 text-xs ${
                                  isThis
                                    ? `${accent} border-current bg-slate-800/40 font-semibold`
                                    : "border-slate-800 bg-slate-900/60 text-slate-400"
                                }`}
                              >
                                {step}
                              </span>
                              {i < service.inPractice!.flow!.length - 1 && (
                                <ChevronRight size={13} className="text-slate-600" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-600">
                        Illustrative — one common shape, not the only way.
                      </p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Core concepts */}
            <Section title="Core concepts">
              <dl className="space-y-3">
                {service.coreConcepts.map((c) => (
                  <div
                    key={c.term}
                    className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
                  >
                    <dt className="font-semibold text-slate-100">{c.term}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-slate-400">
                      {c.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            {/* When to use / not */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-900/10 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                  <Check size={15} /> Reach for it when
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {service.whenToUse.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 text-emerald-400/70">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-rose-500/25 bg-rose-900/10 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-300">
                  <X size={15} /> Not the tool for
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {service.whenNotToUse.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 text-rose-400/70">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Key facts */}
            <Section icon={<Gauge size={16} />} title="Key facts & limits">
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <tbody>
                    {service.keyFacts.map((f, i) => (
                      <tr
                        key={f.label}
                        className={i % 2 ? "bg-slate-900/20" : "bg-slate-900/40"}
                      >
                        <th className="w-1/3 px-4 py-2 text-left align-top font-medium text-slate-400">
                          {f.label}
                        </th>
                        <td className="px-4 py-2 text-slate-200">{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Pricing shape */}
            <Section icon={<Wallet size={16} />} title="How you pay">
              <p className="leading-relaxed text-slate-300">{service.pricingShape}</p>
            </Section>

            {/* Gotchas */}
            <Section icon={<AlertTriangle size={16} />} title="Gotchas">
              <ul className="space-y-2 text-sm text-slate-300">
                {service.gotchas.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 text-amber-400/70">⚠</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* Cross-cloud equivalents */}
            {service.equivalents.length > 0 && (
              <Section icon={<Shuffle size={16} />} title="On the other clouds">
                <div className="grid gap-3 sm:grid-cols-2">
                  {service.equivalents.map((e) => (
                    <Link
                      key={`${e.provider}-${e.id}`}
                      href={`/cloud/${e.provider}/${e.id}`}
                      className="group rounded-xl border border-slate-800 bg-slate-900/40 p-3 transition-colors hover:border-slate-700 hover:bg-slate-900/70"
                    >
                      <div className={`text-[11px] font-semibold uppercase tracking-wide ${PROVIDER_ACCENT[e.provider]}`}>
                        {PROVIDER_LABELS[e.provider]}
                      </div>
                      <div className="font-medium text-slate-100">{e.name}</div>
                      {e.note && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {e.note}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            {service.docsUrl && (
              <a
                href={service.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                <ExternalLink size={14} />
                Official docs
              </a>
            )}
          </article>

          {/* Ask · Notes — docked on desktop, stacks below on mobile */}
          <aside className="lg:w-80 lg:shrink-0">
            <div className="lg:sticky lg:top-6">
              <ServiceRail
                provider={service.provider}
                serviceId={service.id}
                serviceName={service.name}
              />
            </div>
          </aside>
        </div>
        </MarginProvider>
      </main>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="group/section">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {icon && <span className="text-slate-500">{icon}</span>}
        {title}
        {/* Pull this section into the margin. Hidden until the section is
            hovered, so seven of these don't compete with the writing. */}
        <StubButton heading={title} />
      </h2>
      {children}
    </section>
  );
}
