import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser, isPlatformSuperAdmin } from '@/modules/auth';
import { getUserTenants, resolveActiveMembership, ACTIVE_TENANT_COOKIE } from '@/modules/tenant';
import { TenantProvider } from '@/modules/tenant/context';
import { getAllPublicBooks, getUserActiveReadingList } from '@/modules/library/service';
import { getUserFamily } from '@/modules/family/service';
import { getTenantRooms } from '@/modules/room/service';
import { BookCatalog, ContinueReadingSection, UserProfileHeader } from '@/modules/library/components';
import { AppNavbar } from '@/components/layout';
import { BookOpen, ArrowRight, HeartHandshake } from 'lucide-react';

export const metadata = {
  title: 'Thư viện - Family Reading Room',
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

  // Parallel data fetching for instant response
  const [isSuperAdmin, familyContext, books, activeReadings, rooms] = await Promise.all([
    isPlatformSuperAdmin(user.email),
    getUserFamily(user.id),
    getAllPublicBooks(),
    getUserActiveReadingList(user.id),
    tenantId ? getTenantRooms(tenantId) : Promise.resolve([]),
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
          tenantName={familyContext?.family.name || activeMembership?.tenant.name || 'Solo Space'}
          familyName={familyContext?.family.name}
          familyRole={familyContext?.memberRole}
          isSuperAdmin={isSuperAdmin}
          role={activeMembership?.role}
          liveRoomsCount={rooms.length}
        />

        {/* Dashboard Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
          {/* User Profile Header (Name edit, role badge, family link) */}
          <UserProfileHeader
            user={user}
            isSuperAdmin={isSuperAdmin}
            familyContext={familyContext}
          />

          {/* Continue Reading Section (Personal Progress) */}
          {activeReadings.length > 0 && (
            <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <ContinueReadingSection items={activeReadings} />
            </div>
          )}

          {/* Public Library Catalog (With search, filter, and progress) */}
          <section className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <BookCatalog
              books={books}
              isSuperAdmin={isSuperAdmin}
              tenantId={tenantId}
              userProgressMap={userProgressMap}
            />
          </section>

          {/* Bottom Highlights: Family Space Connection & Device Cache */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Family Space Quick Card */}
            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="inline-flex p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                {familyContext ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                    <span>{familyContext.members.length} Thành viên</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    Chưa kết nối
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {familyContext ? familyContext.family.name : 'Không gian gia đình (Family Space)'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {familyContext
                    ? `Mã gia đình: ${familyContext.family.familyCode}. Chia sẻ tủ sách chung, thảo luận và mở phòng đọc đồng bộ.`
                    : 'Gia nhập hoặc tự tạo không gian gia đình bằng mã định danh (Family ID) để cùng chia sẻ tủ sách và đọc chung.'}
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/family"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold text-xs border border-purple-200 dark:border-purple-800 transition"
                >
                  <span>{familyContext ? 'Mở tủ sách gia đình' : 'Tham gia hoặc Tạo gia đình'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Offline-first IndexedDB Cache */}
            <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="inline-flex p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Bộ nhớ đệm thiết bị (IndexedDB)
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Sách sau khi mở sẽ được lưu trữ an toàn trong trình duyệt của bạn, cho phép tải trang tức thì và đọc mượt mà ngay cả khi mạng yếu.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Sẵn sàng hoạt động
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TenantProvider>
  );
}
