import { useState } from 'react';
import { ChefHat, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err =
      mode === 'signup'
        ? await signUp(email, password, displayName)
        : await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex">
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <img
          src="https://images.pexels.com/photos/1556688/pexels-photo-1556688.jpeg?auto=compress&cs=tinysrgb&w=1600"
          alt="Cooking"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-stone-900/80 via-stone-900/50 to-stone-900/80" />
        <div className="relative z-10 flex flex-col justify-end p-14">
          <blockquote className="max-w-md">
            <p className="font-display text-[32px] font-semibold text-white leading-[1.2] mb-4">
              "Your kitchen deserves a workspace as organized as your work."
            </p>
            <p className="text-[14px] text-stone-300 leading-relaxed">
              Clip recipes from TikTok, Instagram, and the web. Let AI extract the
              ingredients and steps. Cook with confidence.
            </p>
          </blockquote>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 lg:px-20">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-lg bg-stone-900 text-stone-50 flex items-center justify-center">
              <ChefHat className="w-5 h-5" strokeWidth={2} />
            </div>
            <span className="font-display text-[20px] font-semibold text-stone-900">
              Mise
            </span>
          </div>

          <h1 className="font-display text-[30px] font-semibold text-stone-900 leading-tight mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your workspace'}
          </h1>
          <p className="text-[14px] text-stone-500 mb-8">
            {mode === 'signin'
              ? 'Sign in to pick up where you left off.'
              : 'Start organizing your recipes in seconds.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-[12px] font-medium text-stone-700 mb-1 block">
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3.5 py-2.5 text-[14px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
              </div>
            )}
            <div>
              <label className="text-[12px] font-medium text-stone-700 mb-1 block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3.5 py-2.5 text-[14px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-stone-700 mb-1 block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 pr-10 text-[14px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-[13px]">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white text-[14px] font-medium rounded-lg transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[13px] text-stone-500">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
                className="text-stone-900 font-medium hover:underline"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
