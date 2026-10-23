import { redirect } from 'next/navigation';
import { getCurrentUser, isPlatformSuperAdmin } from '@/modules/auth';
import { getUserFamily, getFamilyBookshelf } from '@/modules/family/service';
import { getAllPublicBooks } from '@/modules/library/service';
import { FamilyHub } from '@/modules/family/components';
import { AppNavbar } from '@/components/layout';

export const metadata = {
  title: 'Không gian gia đình - Family Reading Room',
  description: 'Kết nối gia đình, chia sẻ tủ sách chung và đọc sách đồng bộ cùng người thân.',
};

export default async function FamilyPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirectTo=/family');
  }

  const [isSuperAdmin, familyContext, allPublicBooks] = await Promise.all([
    isPlatformSuperAdmin(user.email),
    getUserFamily(user.id),
    getAllPublicBooks(),
  ]);

  const familyBooks = familyContext
    ? await getFamilyBookshelf(familyContext.family.id)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Unified Top Navigation Shell */}
      <AppNavbar
        activePath="/family"
        userName={user.fullName}
        userEmail={user.email}
        familyName={familyContext?.family.name}
        familyRole={familyContext?.memberRole}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Main Family Hub Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <FamilyHub
          currentUserId={user.id}
          familyContext={familyContext}
          familyBooks={familyBooks}
          allPublicBooks={allPublicBooks}
        />
      </main>
    </div>
  );
}
