import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { canManageRoom } from '@/modules/entitlements';
import { getTenantRooms } from '@/modules/room/service';
import { getTenantBooks } from '@/modules/library/service';
import { RoomLobby } from '@/modules/room/components';
import { AppNavbar } from '@/components/layout';

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
      {/* Unified Top Navigation Shell */}
      <AppNavbar
        activePath="/room"
        userName={user.fullName}
        userEmail={user.email}
        tenantName={activeMembership.tenant.name}
        role={activeMembership.role}
        liveRoomsCount={rooms.length}
      />

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
