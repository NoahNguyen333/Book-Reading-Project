import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { canUploadBooks } from '@/modules/entitlements';
import { getBookDetails, getUserReadingProgress, getBookmarks } from '@/modules/reader/service';
import { getBookAnnotations } from '@/modules/reader/annotations/service';
import { ReaderContainer } from '@/modules/reader/components';
import { ArrowLeft, BookOpen } from 'lucide-react';

interface ReaderPageProps {
  params: Promise<{
    bookId: string;
  }>;
  searchParams?: Promise<{
    loc?: string;
  }>;
}

export async function generateMetadata({ params }: ReaderPageProps) {
  const { bookId } = await params;
  return {
    title: `Reading Book - Family Reading Room`,
    description: `Reader session for ${bookId}`,
  };
}

export default async function ReaderPage({ params, searchParams }: ReaderPageProps) {
  const { bookId } = await params;
  const search = searchParams ? await searchParams : undefined;
  const targetLocation = search?.loc || null;

  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirectTo=/reader/${bookId}`);
  }

  // 1. Fetch book details strictly by bookId (supports cross-tenant reading)
  const book = await getBookDetails(bookId);

  if (!book) {
    notFound();
  }

  // 2. Resolve user's space context (optional for solo reading)
  const cookieStore = await cookies();
  const activeTenantCookie = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value || null;

  const memberships = await getUserTenants(user.id);
  const activeMembership = resolveActiveMembership(memberships, activeTenantCookie);
  const tenantName = activeMembership?.tenant.name || 'Solo Reading';

  const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const isSuperAdmin = Boolean(user.email && superAdminEmail && user.email.trim().toLowerCase() === superAdminEmail);
  const isAdmin = isSuperAdmin || (activeMembership ? canUploadBooks(activeMembership.role) : false);

  // 3. Hydrate reading progress, bookmarks, and annotations in parallel without cross-tenant block
  const [progress, bookmarks, annotations] = await Promise.all([
    getUserReadingProgress(bookId, user.id),
    getBookmarks(bookId, user.id),
    getBookAnnotations(bookId, book.tenantId, user.id),
  ]);

  const startingLocation = targetLocation || progress?.cfi || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white select-none">
      {/* Top Reader Navigation Bar */}
      <header className="h-12 border-b border-gray-800 bg-gray-950 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex items-center gap-2 max-w-md truncate">
            <BookOpen className="w-4 h-4 text-[#C25E38] shrink-0" />
            <h1 className="text-xs sm:text-sm font-semibold truncate text-gray-200">
              {book.title}
            </h1>
            {book.author && (
              <span className="text-xs text-gray-400 hidden sm:inline truncate">
                by {book.author}
              </span>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 font-medium">
          {tenantName}
        </div>
      </header>

      {/* Main Reader Canvas */}
      <main className="flex-1 relative w-full h-[calc(100vh-3rem)] overflow-hidden">
        <ReaderContainer
          bookId={bookId}
          tenantId={book.tenantId}
          initialCfi={startingLocation}
          initialBookmarks={bookmarks}
          initialAnnotations={annotations}
          bookTitle={book.title}
          currentUserId={user.id}
          isAdmin={isAdmin}
          format={book.format}
        />
      </main>
    </div>
  );
}
