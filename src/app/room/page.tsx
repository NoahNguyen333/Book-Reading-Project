import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser, signOut } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { canManageRoom } from '@/modules/entitlements';
import { getTenantRooms } from '@/modules/room/service';
import { getTenantBooks } from '@/modules/library/service';
import { RoomLobby } from '@/modules/room/components';
import { Button } from '@/components/ui';
import { BookOpen, ArrowLeft, LogOut } from 'lucide-react';

export const metadata = {
  title: 'Reading Rooms - Family Reading Room',
  description: 'Join synchronized family reading rooms with video calls and live page turns.',
};

export default async function RoomLobbyPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirectTo=/room');
  }

  const cookieStore = await cookies();
  const activeTenantCookie = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value || null;

  const memberships = await getUserTenants(user.id);
  const activeMembership = resolveActiveMembership(memberships, activeTenantCookie);

  if (!activeMembership) {
    redirect('/dashboard');
  }

  const tenantId = activeMembership.tenant.id;
  const canCreate = canManageRoom(activeMembership.role);

  const [rooms, books] = await Promise.all([
    getTenantRooms(tenantId),
    getTenantBooks(tenantId),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Top Navigation */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800" />
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-lg">
                <BookOpen className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                Family Reading Room
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs text-gray-500 dark:text-gray-400">
              {activeMembership.tenant.name}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit" className="gap-1.5 text-xs">
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Lobby Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <RoomLobby
          rooms={rooms}
          tenantId={tenantId}
          books={books}
          canCreateRoom={canCreate}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
