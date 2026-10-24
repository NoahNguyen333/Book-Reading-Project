import { BookOpen, Users, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-3xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-amber-100/70 text-amber-900 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/40 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#C25E38] dark:text-[#D97750]" />
          <span>Connected Reading Spaces for Families</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Family Reading Room
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto">
          Synchronized e-book reading, shared bookmarks, and integrated family reading rooms designed for parents, kids, and grandparents.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link href="/register">
            <Button size="lg" variant="primary" className="gap-2">
              <span>Create Family Space</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="gap-2">
              <span>Sign In</span>
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="ghost" className="gap-2">
              <Users className="w-4 h-4" />
              <span>Go to Dashboard</span>
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 text-left">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
            <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Tenant Isolation</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Multi-tenant architecture powered by PostgreSQL Row-Level Security.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
            <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Local Blob Cache</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              IndexedDB EPUB caching with byte verification for instant page loads.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Shared Rooms</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Realtime page synchronization for family reading across any distance.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
