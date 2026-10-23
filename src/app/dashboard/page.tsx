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
import { BookOpen, ArrowRight, HeartHandshake, CheckCircle2 } from 'lucide-react';

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
      <div className="min-h-screen bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1]">
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
          {/* 1. Welcoming Editorial Greeting & Compact Profile Masthead */}
          <UserProfileHeader
            user={user}
            isSuperAdmin={isSuperAdmin}
            familyContext={familyContext}
          />

          {/* 2. Reading Priority: In-Progress Hero Section */}
          {activeReadings.length > 0 && (
            <div className="pt-2">
              <ContinueReadingSection items={activeReadings} />
            </div>
          )}

          {/* 3. Book Discovery Catalog */}
          <section aria-labelledby="catalog-heading" className="pt-2">
            <BookCatalog
              books={books}
              isSuperAdmin={isSuperAdmin}
              tenantId={tenantId}
              userProgressMap={userProgressMap}
            />
          </section>

          {/* 4. Secondary Companion Highlights: Family Hub & Offline Storage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#E6E1D6] dark:border-[#2B2A26]">
            {/* Family Space Quick Card */}
            <div className="p-6 bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex p-2.5 rounded-xl bg-[#FDF0EC] text-[#C25E38] dark:bg-[#281C18] dark:text-[#E08A6C] border border-[#F4D3C7] dark:border-[#3E2822]">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  {familyContext ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFECE4] text-[#5B7065] dark:bg-[#252420] dark:text-[#8FA196] border border-[#E0DBD0] dark:border-[#2B2A26]">
                      <span>{familyContext.members.length} Thành viên</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EFECE4] text-[#706B63] dark:bg-[#252420] dark:text-[#999388]">
                      Chưa kết nối
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-serif text-lg font-bold text-[#23211E] dark:text-[#EDE9E1]">
                    {familyContext ? familyContext.family.name : 'Không gian gia đình'}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#706B63] dark:text-[#999388] mt-1 leading-relaxed">
                    {familyContext
                      ? `Mã gia đình: ${familyContext.family.familyCode}. Chia sẻ tủ sách chung, thảo luận trích dẫn và mở phòng đọc đồng bộ từng trang.`
                      : 'Gia nhập hoặc tự tạo không gian gia đình bằng mã định danh (Family ID) để cùng chia sẻ tủ sách và đọc chung.'}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/family"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#EFECE4] hover:bg-[#E5E1D6] dark:bg-[#2A2925] dark:hover:bg-[#34332E] text-[#23211E] dark:text-[#EDE9E1] font-medium text-xs transition"
                >
                  <span>{familyContext ? 'Mở tủ sách gia đình' : 'Tham gia hoặc Tạo gia đình'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#C25E38] dark:text-[#D97750]" />
                </Link>
              </div>
            </div>

            {/* Offline-first Reading Cache Companion */}
            <div className="p-6 bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="inline-flex p-2.5 rounded-xl bg-[#EFECE4] text-[#5B7065] dark:bg-[#252420] dark:text-[#8FA196] border border-[#E0DBD0] dark:border-[#2B2A26]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#23211E] dark:text-[#EDE9E1]">
                    Bộ nhớ đệm đọc ngoại tuyến
                  </h3>
                  <p className="text-xs sm:text-sm text-[#706B63] dark:text-[#999388] mt-1 leading-relaxed">
                    Sách sau khi mở sẽ được lưu trữ an toàn trong trình duyệt của bạn, cho phép tải trang tức thì và đọc mượt mà ngay cả khi không có mạng.
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#EFECE4] text-[#5B7065] dark:bg-[#252420] dark:text-[#8FA196] border border-[#E0DBD0] dark:border-[#2B2A26]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sẵn sàng ngoại tuyến</span>
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TenantProvider>
  );
}
