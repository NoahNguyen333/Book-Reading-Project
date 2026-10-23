import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { canReadBooks, canUploadBooks } from '@/modules/entitlements';
import { getGroupedUserAnnotations } from '@/modules/reader/annotations/service';
import { getTenantRooms } from '@/modules/room/service';
import { KnowledgeNotebook } from '@/modules/reader/components/KnowledgeNotebook';
import { AppNavbar } from '@/components/layout';

export const metadata = {
  title: 'Knowledge Notebook - Family Reading Room',
  description: 'Your central hub for book highlights, reflections, and quotes across the family library.',
};

export default async function NotebookPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirectTo=/notebook');
  }

  const cookieStore = await cookies();
  const activeTenantCookie = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value || null;

  const memberships = await getUserTenants(user.id);
  const activeMembership = resolveActiveMembership(memberships, activeTenantCookie);

  if (!activeMembership) {
    redirect('/dashboard');
  }

  if (!canReadBooks(activeMembership.role)) {
    redirect('/dashboard');
  }

  const tenantId = activeMembership.tenant.id;
  const isAdmin = canUploadBooks(activeMembership.role);

  // Fetch grouped book annotations and active rooms in parallel
  const [groupedBooks, rooms] = await Promise.all([
    getGroupedUserAnnotations(tenantId, user.id),
    getTenantRooms(tenantId),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Unified Top Navigation Shell */}
      <AppNavbar
        activePath="/notebook"
        userName={user.fullName}
        userEmail={user.email}
        tenantName={activeMembership.tenant.name}
        role={activeMembership.role}
        liveRoomsCount={rooms.length}
      />

      {/* Main Notebook Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <KnowledgeNotebook
          groupedBooks={groupedBooks}
          tenantId={tenantId}
          currentUserId={user.id}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  );
}
