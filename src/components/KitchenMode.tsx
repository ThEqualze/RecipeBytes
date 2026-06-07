import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Timer,
  Pause,
  Play,
  RotateCcw,
  Bell,
} from 'lucide-react';
import type { Recipe, Ingredient, Instruction } from '../lib/database.types';
import { formatQuantity } from '../lib/format';

interface KitchenModeProps {
  recipe: Recipe;
  ingredients: Ingredient[];
  instructions: Instruction[];
  onExit: () => void;
}

interface ActiveTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remaining: number;
  running: boolean;
  finished: boolean;
}

export function KitchenMode({
  recipe,
  ingredients,
  instructions,
  onExit,
}: KitchenModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [showIngredients, setShowIngredients] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {}
    }
    requestWakeLock();
    return () => {
      wakeLockRef.current?.release();
    };
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running || t.finished) return t;
          const next = t.remaining - 1;
          if (next <= 0) {
            playAlarm();
            return { ...t, remaining: 0, running: false, finished: true };
          }
          return { ...t, remaining: next };
        })
      );
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startTimer = useCallback(
    (stepIdx: number) => {
      const step = instructions[stepIdx];
      if (!step?.timer_seconds) return;
      const exists = timers.find((t) => t.id === step.id);
      if (exists) return;
      setTimers((prev) => [
        ...prev,
        {
          id: step.id,
          label: `Step ${step.step_number}`,
          totalSeconds: step.timer_seconds!,
          remaining: step.timer_seconds!,
          running: true,
          finished: false,
        },
      ]);
    },
    [instructions, timers]
  );

  const toggleTimer = (id: string) =>
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: !t.running } : t))
    );

  const resetTimer = (id: string) =>
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, remaining: t.totalSeconds, running: false, finished: false }
          : t
      )
    );

  const dismissTimer = (id: string) =>
    setTimers((prev) => prev.filter((t) => t.id !== id));

  const toggleChecked = (id: string) =>
    setChecked((p) => ({ ...p, [id]: !p[id] }));

  const step = instructions[currentStep];
  const hasPrev = currentStep > 0;
  const hasNext = currentStep < instructions.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950 text-stone-100 flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-5 lg:px-8 py-4 border-b border-stone-800/60">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onExit}
            className="w-10 h-10 rounded-lg bg-stone-800 hover:bg-stone-700 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
              Kitchen Mode
            </div>
            <h1 className="font-display text-[18px] lg:text-[22px] font-semibold text-stone-100 truncate leading-tight">
              {recipe.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIngredients(!showIngredients)}
            className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              showIngredients
                ? 'bg-stone-100 text-stone-900'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            Ingredients
          </button>
        </div>
      </header>

      {/* Active timers strip */}
      {timers.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-5 lg:px-8 py-3 bg-stone-900/80 border-b border-stone-800/40 overflow-x-auto scrollbar-thin">
          {timers.map((t) => (
            <TimerPill
              key={t.id}
              timer={t}
              onToggle={() => toggleTimer(t.id)}
              onReset={() => resetTimer(t.id)}
              onDismiss={() => dismissTimer(t.id)}
            />
          ))}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Ingredients panel (conditionally shown) */}
        {showIngredients && (
          <aside className="absolute inset-y-0 left-0 z-10 w-72 sm:w-80 lg:w-96 sm:relative sm:z-auto border-r border-stone-800/60 overflow-y-auto scrollbar-thin bg-stone-900 sm:bg-stone-900/40 px-5 py-6 shrink-0">
            <h2 className="text-[13px] uppercase tracking-wider font-semibold text-stone-500 mb-4">
              Ingredients
            </h2>
            <ul className="space-y-1">
              {ingredients.map((ing) => (
                <li
                  key={ing.id}
                  onClick={() => toggleChecked(ing.id)}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-stone-800/60 ${
                    checked[ing.id] ? 'opacity-40' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                      checked[ing.id]
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-stone-600'
                    }`}
                  >
                    {checked[ing.id] && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3 text-white">
                        <path
                          d="M2 6l3 3 5-6"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-[16px] leading-relaxed">
                    {ing.quantity != null && (
                      <span className="font-semibold text-stone-100 tabular-nums">
                        {formatQuantity(ing.quantity)}
                        {ing.unit && ` ${ing.unit}`}
                      </span>
                    )}
                    {ing.quantity != null && ' '}
                    <span className={checked[ing.id] ? 'line-through text-stone-500' : 'text-stone-300'}>
                      {ing.name}
                    </span>
                    {ing.prep_note && (
                      <span className="text-stone-500">, {ing.prep_note}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* Step display */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 lg:px-16 py-10 overflow-y-auto">
          {step ? (
            <div className="w-full max-w-2xl animate-fade-in" key={step.id}>
              <div className="text-center mb-8">
                <span className="inline-block text-[12px] uppercase tracking-widest text-stone-500 font-semibold mb-2">
                  Step {step.step_number} of {instructions.length}
                </span>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  {instructions.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 rounded-full transition-all ${
                        idx === currentStep
                          ? 'w-6 bg-stone-100'
                          : idx < currentStep
                          ? 'w-3 bg-stone-500'
                          : 'w-3 bg-stone-800'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <p className="font-display text-[28px] lg:text-[36px] leading-[1.4] text-stone-100 text-center font-medium tracking-tight">
                {step.content}
              </p>

              {step.timer_seconds && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={() => startTimer(currentStep)}
                    disabled={timers.some((t) => t.id === step.id)}
                    className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[15px] font-medium hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-default transition-colors"
                  >
                    <Timer className="w-5 h-5" />
                    {timers.some((t) => t.id === step.id)
                      ? 'Timer running'
                      : `Start ${formatTimerDisplay(step.timer_seconds)} timer`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="font-display text-[28px] text-stone-300">No instructions</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <footer className="shrink-0 border-t border-stone-800/60 px-5 lg:px-8 py-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((s) => s - 1)}
          disabled={!hasPrev}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed text-[15px] font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </button>

        <div className="text-[14px] text-stone-500 tabular-nums">
          {currentStep + 1} / {instructions.length}
        </div>

        <button
          onClick={() => setCurrentStep((s) => s + 1)}
          disabled={!hasNext}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-100 text-stone-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-[15px] font-medium transition-colors"
        >
          Next
          <ChevronRight className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
}

function TimerPill({
  timer,
  onToggle,
  onReset,
  onDismiss,
}: {
  timer: ActiveTimer;
  onToggle: () => void;
  onReset: () => void;
  onDismiss: () => void;
}) {
  const progress = 1 - timer.remaining / timer.totalSeconds;
  const isFinished = timer.finished;

  return (
    <div
      className={`shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-colors ${
        isFinished
          ? 'bg-amber-500/15 border-amber-500/40 animate-pulse'
          : 'bg-stone-800/80 border-stone-700/60'
      }`}
    >
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-stone-700"
          />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${progress * 81.7} 81.7`}
            strokeLinecap="round"
            className={isFinished ? 'text-amber-400' : 'text-emerald-400'}
          />
        </svg>
        {isFinished && (
          <Bell className="absolute inset-0 m-auto w-3.5 h-3.5 text-amber-300" />
        )}
      </div>

      <div>
        <div className="text-[11px] text-stone-400 font-medium">{timer.label}</div>
        <div className={`font-mono text-[18px] font-semibold tabular-nums leading-tight ${
          isFinished ? 'text-amber-300' : 'text-stone-100'
        }`}>
          {formatTimerDisplay(timer.remaining)}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-1">
        {!isFinished && (
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-md bg-stone-700 hover:bg-stone-600 flex items-center justify-center transition-colors"
          >
            {timer.running ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <button
          onClick={onReset}
          className="w-7 h-7 rounded-md bg-stone-700 hover:bg-stone-600 flex items-center justify-center transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {isFinished && (
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-md bg-stone-700 hover:bg-stone-600 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatTimerDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function playAlarm() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    gain.gain.value = 0.3;

    const now = ctx.currentTime;
    const beeps = [0, 0.2, 0.4, 0.8, 1.0, 1.2];
    beeps.forEach((offset) => {
      oscillator.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.setValueAtTime(0, now + offset + 0.1);
    });

    oscillator.start(now);
    oscillator.stop(now + 1.5);
  } catch {}
}
