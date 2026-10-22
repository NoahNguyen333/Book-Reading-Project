import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser, signOut } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { TenantProvider } from '@/modules/tenant/context';
import { Button } from '@/components/ui';
import {
  BookOpen,
  LogOut,
  Shield,
  User as UserIcon,
  Home,
  CheckCircle2,
  Users,
} from 'lucide-react';

export const metadata = {
  title: 'Dashboard - Family Reading Room',
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const activeTenantCookie = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value || null;

  const memberships = await getUserTenants(user.id);
  const activeMembership = resolveActiveMembership(memberships, activeTenantCookie);

  return (
    <TenantProvider
      initialMemberships={memberships}
      initialActiveTenantId={activeMembership?.tenant.id ?? null}
    >
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Navigation Bar */}
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-lg">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-gray-900 dark:text-white">
                Family Reading Room
              </span>
            </div>

            <div className="flex items-center gap-4">
              <form action={signOut}>
                <Button variant="outline" size="sm" type="submit" className="gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </form>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          {/* Welcome Header */}
          <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                  Welcome back, {user.fullName || user.email}!
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Manage your family library, invite readers, or launch a shared reading room.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800 w-fit">
                <CheckCircle2 className="w-4 h-4" />
                <span>Session Active</span>
              </div>
            </div>

            {/* Profile & Active Tenant Badge Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
                  <UserIcon className="w-4 h-4" />
                  <span>User Email</span>
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {user.email}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
                  <Home className="w-4 h-4" />
                  <span>Active Family Space</span>
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {activeMembership?.tenant.name || 'No Space Assigned'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
                  <Shield className="w-4 h-4" />
                  <span>Your Assigned Role</span>
                </div>
                <div className="text-sm font-semibold capitalize text-blue-600 dark:text-blue-400">
                  {activeMembership?.role || 'None'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions & Session 3 Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="inline-flex p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Family Book Library
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upload and organize family EPUB books with local IndexedDB caching and cloud storage.
              </p>
              <div className="pt-2">
                <Button variant="outline" size="sm" disabled className="opacity-70 cursor-not-allowed">
                  Coming in Session 3
                </Button>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="inline-flex p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Synchronized Reading Rooms
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Join realtime rooms with page turn synchronization, audio/video links, and shared notes.
              </p>
              <div className="pt-2">
                <Button variant="outline" size="sm" disabled className="opacity-70 cursor-not-allowed">
                  Coming in Session 4
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TenantProvider>
  );
}
