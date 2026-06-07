import { Sparkles, Loader2, CheckCircle2, AlertCircle, ExternalLink, Trash2, ChevronRight } from 'lucide-react';
import type { ExtractionJob } from '../lib/database.types';
import { sourceIcon, sourceLabel, sourceColor } from '../lib/format';

interface InboxViewProps {
  jobs: ExtractionJob[];
}

export function InboxView({ jobs }: InboxViewProps) {
  const ready = jobs.filter((j) => j.status === 'ready_for_review');
  const processing = jobs.filter((j) =>
    ['pending', 'fetching', 'transcribing', 'analyzing'].includes(j.status)
  );
  const failed = jobs.filter((j) => j.status === 'failed');

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin animate-fade-in">
      <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-4 md:pb-6 border-b border-stone-100">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 lg:gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-accent-600" />
              <span className="text-[12px] uppercase tracking-wider font-semibold text-accent-700">
                AI Extraction
              </span>
            </div>
            <h1 className="font-display text-[26px] sm:text-[34px] font-semibold text-stone-900 leading-none">
              Inbox
            </h1>
            <p className="text-[13px] sm:text-[14px] text-stone-500 mt-2 max-w-xl leading-relaxed">
              Recipes pulled from social videos and web links land here for review.
              Verify the AI's parse, then commit them to your library.
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 w-full lg:w-[320px]">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">
              Paste a link
            </div>
            <div className="flex gap-2">
              <input
                placeholder="https://tiktok.com/..."
                className="flex-1 px-3 py-2 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
              />
              <button className="px-3 py-2 bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-medium rounded-md transition-colors">
                Extract
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8 space-y-10">
        <Section
          title="Ready to review"
          subtitle="The AI has finished. Verify and accept to add to your library."
          count={ready.length}
        >
          {ready.length === 0 ? (
            <Empty text="No recipes waiting for review." />
          ) : (
            ready.map((job) => <ReadyCard key={job.id} job={job} />)
          )}
        </Section>

        <Section title="Processing" count={processing.length}>
          {processing.length === 0 ? (
            <Empty text="No active extractions." />
          ) : (
            processing.map((job) => <ProcessingCard key={job.id} job={job} />)
          )}
        </Section>

        {failed.length > 0 && (
          <Section title="Failed" count={failed.length}>
            {failed.map((job) => (
              <FailedCard key={job.id} job={job} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-display text-[20px] font-semibold text-stone-900">{title}</h2>
        <span className="text-[12px] text-stone-400 tabular-nums font-medium">{count}</span>
      </div>
      {subtitle && <p className="text-[13px] text-stone-500 mb-3">{subtitle}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-[13px] text-stone-400 italic px-1">{text}</div>
  );
}

function ReadyCard({ job }: { job: ExtractionJob }) {
  const SourceIcon = sourceIcon[job.source_type];
  const data = job.extracted_data as { title?: string; ingredient_count?: number; step_count?: number };
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-4 hover:border-stone-300 hover:shadow-sm transition-all">
      <div className="w-20 h-20 rounded-lg overflow-hidden bg-stone-100 shrink-0">
        {job.thumbnail_url && (
          <img src={job.thumbnail_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${sourceColor[job.source_type]}`}>
            <SourceIcon className="w-3 h-3" />
            {sourceLabel[job.source_type]}
          </span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[12px] text-emerald-700 font-medium">Ready for review</span>
        </div>
        <div className="font-display font-semibold text-[15px] text-stone-900 truncate">
          {data.title ?? 'Untitled extraction'}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-stone-500 mt-1">
          {data.ingredient_count != null && <span>{data.ingredient_count} ingredients</span>}
          {data.step_count != null && <span>{data.step_count} steps</span>}
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 hover:text-stone-700"
          >
            Source <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-medium rounded-lg transition-colors">
        Review
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ProcessingCard({ job }: { job: ExtractionJob }) {
  const SourceIcon = sourceIcon[job.source_type];
  const stages = ['pending', 'fetching', 'transcribing', 'analyzing'] as const;
  const currentIdx = stages.indexOf(job.status as typeof stages[number]);
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 shrink-0">
          {job.thumbnail_url && (
            <img src={job.thumbnail_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${sourceColor[job.source_type]}`}>
              <SourceIcon className="w-3 h-3" />
              {sourceLabel[job.source_type]}
            </span>
            <Loader2 className="w-3.5 h-3.5 text-stone-500 animate-spin" />
            <span className="text-[12px] text-stone-600 font-medium capitalize">
              {job.status}…
            </span>
          </div>
          <div className="text-[13px] text-stone-500 truncate mt-0.5">{job.source_url}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        {stages.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= currentIdx ? 'bg-stone-700' : 'bg-stone-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FailedCard({ job }: { job: ExtractionJob }) {
  const SourceIcon = sourceIcon[job.source_type];
  return (
    <div className="bg-white border border-rose-200 rounded-xl p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
        <AlertCircle className="w-5 h-5 text-rose-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${sourceColor[job.source_type]}`}>
            <SourceIcon className="w-3 h-3" />
            {sourceLabel[job.source_type]}
          </span>
          <span className="text-[12px] font-medium text-rose-700">Failed</span>
        </div>
        <div className="text-[13px] text-stone-700">{job.error_message}</div>
        <div className="text-[12px] text-stone-400 truncate mt-0.5">{job.source_url}</div>
      </div>
      <button className="text-[12px] font-medium text-stone-600 hover:text-stone-900 px-2 py-1 rounded-md hover:bg-stone-100">
        Retry
      </button>
      <button className="w-8 h-8 rounded-md text-stone-400 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
