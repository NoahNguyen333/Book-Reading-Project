import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { canReadBooks, canManageRoom, canUploadBooks } from '@/modules/entitlements';
import { getRoomById } from '@/modules/room/service';
import { getBookAnnotations } from '@/modules/reader/annotations/service';
import { Annotation } from '@/modules/reader/annotations/types';
import { CollaborativeReader } from '@/modules/room/components';

interface RoomPageProps {
  params: Promise<{
    roomId: string;
  }>;
}

export async function generateMetadata({ params }: RoomPageProps) {
  const { roomId } = await params;
  return {
    title: `Reading Room - Family Reading Room`,
    description: `Collaborative reading session ${roomId}`,
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirectTo=/room/${roomId}`);
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
  const room = await getRoomById(roomId, tenantId);

  if (!room) {
    notFound();
  }

  const isHost = canManageRoom(activeMembership.role) || room.sessionState?.hostUserId === user.id;
  const isAdmin = canUploadBooks(activeMembership.role);

  let initialAnnotations: Annotation[] = [];
  if (room.activeBookId) {
    try {
      initialAnnotations = await getBookAnnotations(room.activeBookId, tenantId, user.id);
    } catch {
      // Safe fallback
    }
  }

  return (
    <CollaborativeReader
      room={room}
      currentUser={user}
      isHost={isHost}
      isAdmin={isAdmin}
      tenantId={tenantId}
      initialAnnotations={initialAnnotations}
    />
  );
}
