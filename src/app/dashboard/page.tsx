import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { TenantProvider } from '@/modules/tenant/context';
import { canUploadBooks } from '@/modules/entitlements';
import { getTenantBooks, getUserActiveReadingList } from '@/modules/library/service';
import { getTenantRooms } from '@/modules/room/service';
import { BookCatalog, ContinueReadingSection } from '@/modules/library/components';
import { AppNavbar } from '@/components/layout';
import {
  BookOpen,
  Shield,
  User as UserIcon,
  Home,
  CheckCircle2,
  Users,
  ArrowRight,
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

  const tenantId = activeMembership?.tenant.id || '';
  const isAdmin = canUploadBooks(activeMembership?.role);

  // Fetch tenant books, active rooms, and user's reading progress in parallel
  const [books, rooms, activeReadings] = await Promise.all([
    tenantId ? getTenantBooks(tenantId) : Promise.resolve([]),
    tenantId ? getTenantRooms(tenantId) : Promise.resolve([]),
    tenantId ? getUserActiveReadingList(tenantId, user.id) : Promise.resolve([]),
  ]);

  // Construct quick lookup for book progress percentage
  const userProgressMap: Record<string, number> = {};
  for (const item of activeReadings) {
    userProgressMap[item.book.id] = item.percentage;
  }

  return (
    <TenantProvider
      initialMemberships={memberships}
      initialActiveTenantId={activeMembership?.tenant.id ?? null}
    >
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Unified Top Navigation Shell */}
        <AppNavbar
          activePath="/dashboard"
          userName={user.fullName}
          userEmail={user.email}
          tenantName={activeMembership?.tenant.name}
          role={activeMembership?.role}
          liveRoomsCount={rooms.length}
        />

        {/* Dashboard Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
          {/* Welcome Header */}
          <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                  Welcome back, {user.fullName || user.email}!
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Manage your family library, upload books, and initiate synchronized reading sessions.
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

          {/* Continue Reading Section (Active Progress) */}
          {activeReadings.length > 0 && (
            <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <ContinueReadingSection items={activeReadings} />
            </div>
          )}

          {/* Book Catalog Section (Live with search, filter, and progress) */}
          <section className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <BookCatalog
              books={books}
              isAdmin={isAdmin}
              tenantId={tenantId}
              userProgressMap={userProgressMap}
            />
          </section>

          {/* Live Reading Rooms Widget & Device Cache Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="inline-flex p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <Users className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{rooms.length} {rooms.length === 1 ? 'Room Active' : 'Rooms Active'}</span>
                </span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Live Reading Rooms
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Synchronized multi-room spaces with real-time host page turns, video calls, and isolated progress.
                </p>
              </div>

              {rooms.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {rooms.slice(0, 2).map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs"
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-gray-900 dark:text-white truncate">
                          {room.title}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {room.activeBook ? room.activeBook.title : 'No active book'}
                        </div>
                      </div>
                      <Link
                        href={`/room/${room.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shrink-0 transition"
                      >
                        <span>Join</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No reading rooms active right now.</p>
              )}

              <div className="pt-2">
                <Link
                  href="/room"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold text-xs border border-purple-200 dark:border-purple-800 transition"
                >
                  <span>Open Rooms Lobby</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="inline-flex p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                IndexedDB Device Cache
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Local blob caching engine configured for instant offline-first reading.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Engine Ready
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TenantProvider>
  );
}
