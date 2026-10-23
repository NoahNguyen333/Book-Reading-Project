'use client';

import React, { useState } from 'react';
import {
  Plus,
  Sparkles,
  BookOpen,
  HeartHandshake,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { UserFamilyContext } from '../types';
import { Book } from '@/modules/library/types';
import { JoinFamilyCard } from './JoinFamilyCard';
import { CreateFamilyModal } from './CreateFamilyModal';
import { FamilyHeader } from './FamilyHeader';
import { FamilyBookshelf } from './FamilyBookshelf';
import { MemberManagement } from './MemberManagement';

interface FamilyHubProps {
  currentUserId: string;
  familyContext: UserFamilyContext | null;
  familyBooks: Book[];
  allPublicBooks: Book[];
}

export function FamilyHub({
  currentUserId,
  familyContext,
  familyBooks,
  allPublicBooks,
}: FamilyHubProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // STATE A: User is not yet part of any family
  if (!familyContext) {
    return (
      <div className="space-y-8">
        {/* Intro Banner */}
        <div className="bg-gradient-to-r from-purple-900/10 via-blue-900/10 to-transparent p-6 sm:p-8 rounded-2xl border border-purple-200/60 dark:border-purple-800/40 space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-purple-600 text-white shadow-md">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            Không gian Đọc sách Gia đình (Opt-In Family Hub)
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 max-w-2xl leading-relaxed">
            Bạn có thể đọc sách một mình bất cứ lúc nào. Nhưng khi muốn cùng nhau chia sẻ tủ sách, ghi chú chung và mở phòng đọc đồng bộ từng trang, hãy kết nối gia đình tại đây!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-800">
              <BookOpen className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xs font-bold text-gray-900 dark:text-white">Tủ sách tuyển chọn</h2>
                <p className="text-[11px] text-gray-500">Gom những cuốn sách yêu thích cho người thân.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-800">
              <Radio className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xs font-bold text-gray-900 dark:text-white">Phòng đọc đồng bộ</h2>
                <p className="text-[11px] text-gray-500">Lật trang cùng lúc kèm video call tích hợp.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-800">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xs font-bold text-gray-900 dark:text-white">Mã ID tiện lợi</h2>
                <p className="text-[11px] text-gray-500">Mã ngắn 4 ký tự dễ nhớ, không nhầm lẫn.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Choice Grid: Join Existing OR Create New */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Join via Family Code */}
          <JoinFamilyCard />

          {/* Card 2: Create New Family */}
          <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Tạo không gian gia đình mới
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    Khởi tạo nhóm riêng cho tổ ấm của bạn và nhận mã mời ngay lập tức.
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Người tạo sẽ tự động được cấp quyền Quản trị viên (Admin) để quản lý danh sách thành viên, phân quyền Nhóm phó (Moderator) và tuyển chọn tủ sách.
              </p>
            </div>

            <div>
              <Button
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5"
              >
                <Plus className="w-4 h-4" />
                <span>Khởi tạo Gia đình</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Create Family Modal */}
        <CreateFamilyModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    );
  }

  // STATE B: User is in a family
  return (
    <div className="space-y-8">
      {/* Header with 1-click copy code, role badge, leave button */}
      <FamilyHeader
        family={familyContext.family}
        memberRole={familyContext.memberRole}
        memberCount={familyContext.members.length}
      />

      {/* Curated Family Bookshelf */}
      <FamilyBookshelf
        familyId={familyContext.family.id}
        memberRole={familyContext.memberRole}
        familyBooks={familyBooks}
        allPublicBooks={allPublicBooks}
      />

      {/* Member Management */}
      <MemberManagement
        familyId={familyContext.family.id}
        currentUserId={currentUserId}
        currentUserRole={familyContext.memberRole}
        members={familyContext.members}
      />
    </div>
  );
}
