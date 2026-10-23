'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  UserX,
  Loader2,
} from 'lucide-react';
import { FamilyMember, FamilyRole } from '../types';
import { canManageFamilyMembers, formatFamilyRoleDisplay } from '../utils';
import { updateMemberRoleAction, removeFamilyMemberAction } from '../actions';

interface MemberManagementProps {
  familyId: string;
  currentUserId: string;
  currentUserRole: FamilyRole;
  members: FamilyMember[];
}

export function MemberManagement({
  familyId,
  currentUserId,
  currentUserRole,
  members,
}: MemberManagementProps) {
  const router = useRouter();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = canManageFamilyMembers(currentUserRole);

  const handleRoleChange = async (targetUserId: string, newRole: FamilyRole) => {
    setUpdatingUserId(targetUserId);
    setError(null);
    try {
      const res = await updateMemberRoleAction(familyId, targetUserId, newRole);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi cập nhật vai trò');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa thành viên này khỏi không gian gia đình?')) {
      return;
    }

    setRemovingUserId(targetUserId);
    setError(null);
    try {
      const res = await removeFamilyMemberAction(familyId, targetUserId);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xóa thành viên');
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Thành viên gia đình
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {members.length}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Danh sách các thành viên cùng tham gia không gian đọc sách chung.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {/* Members list */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const isTargetAdmin = member.role === 'admin';

          return (
            <div
              key={member.userId}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {member.userName?.[0]?.toUpperCase() || member.userEmail?.[0]?.toUpperCase() || 'U'}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">
                      {member.userName || 'Thành viên'}
                    </span>
                    {isSelf && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        Bạn
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {member.userEmail}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                {/* Role Pill */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                    member.role === 'admin'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : member.role === 'moderator'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>{formatFamilyRoleDisplay(member.role)}</span>
                </span>

                {/* Management actions (Admin only, cannot modify self or other admins) */}
                {canManage && !isSelf && !isTargetAdmin && (
                  <div className="flex items-center gap-1.5">
                    {member.role === 'reader' ? (
                      <button
                        type="button"
                        onClick={() => handleRoleChange(member.userId, 'moderator')}
                        disabled={updatingUserId === member.userId}
                        className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 transition disabled:opacity-50"
                        title="Thăng cấp thành Nhóm phó (quản lý tủ sách)"
                      >
                        {updatingUserId === member.userId ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : (
                          'Đặt Nhóm phó'
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRoleChange(member.userId, 'reader')}
                        disabled={updatingUserId === member.userId}
                        className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition disabled:opacity-50"
                        title="Chuyển về Độc giả thông thường"
                      >
                        {updatingUserId === member.userId ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : (
                          'Hạ thành viên'
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removingUserId === member.userId}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50"
                      title="Xóa thành viên khỏi gia đình"
                    >
                      {removingUserId === member.userId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserX className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
