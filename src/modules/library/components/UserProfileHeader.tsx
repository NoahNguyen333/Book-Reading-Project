'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  User as UserIcon,
  Shield,
  Home,
  CheckCircle2,
  Pencil,
  Check,
  X,
  Loader2,
  ArrowRight,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { updateUserProfileNameAction } from '@/modules/auth';
import { UserFamilyContext } from '@/modules/family/types';
import { formatFamilyRoleDisplay } from '@/modules/family/utils';

export interface UserProfileHeaderProps {
  user: {
    id: string;
    email?: string | null;
    fullName?: string | null;
  };
  isSuperAdmin: boolean;
  familyContext: UserFamilyContext | null;
}

export function UserProfileHeader({
  user,
  isSuperAdmin,
  familyContext,
}: UserProfileHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.fullName || '');
  const [currentName, setCurrentName] = useState(user.fullName || user.email?.split('@')[0] || 'Reader');
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Tên không được để trống.');
      return;
    }

    setIsSaving(true);
    setNameError(null);

    try {
      const res = await updateUserProfileNameAction(trimmed);
      if (res.error) {
        setNameError(res.error);
      } else {
        setCurrentName(trimmed);
        setIsEditingName(false);
      }
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Lỗi cập nhật tên');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setNameInput(currentName);
    setIsEditingName(false);
    setNameError(null);
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-5">
      {/* Top row: Greeting & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
              Chào mừng trở lại,
            </h1>

            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  disabled={isSaving}
                  className="px-2.5 py-1 text-lg sm:text-xl font-bold rounded-lg border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                  title="Lưu tên"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition"
                  title="Hủy"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                  {currentName}!
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(currentName);
                    setIsEditingName(true);
                  }}
                  className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  title="Đổi tên hiển thị"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {nameError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{nameError}</p>
          )}

          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Thư viện cá nhân của bạn, tiếp tục các trang sách dang dở và kết nối đọc cùng gia đình.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800 w-fit">
          <CheckCircle2 className="w-4 h-4" />
          <span>Tài khoản hoạt động</span>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        {/* Email card */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
            <UserIcon className="w-4 h-4" />
            <span>Email tài khoản</span>
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={user.email || ''}>
            {user.email}
          </div>
        </div>

        {/* System Role card */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4" />
            <span>Vai trò hệ thống</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                isSuperAdmin
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              {isSuperAdmin ? 'Platform Super Admin' : 'Độc giả (Reader)'}
            </span>
          </div>
        </div>

        {/* Family Affiliation card */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              <span>Gia đình liên kết</span>
            </div>
            <Link
              href="/family"
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
            >
              Chi tiết <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {familyContext ? (
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {familyContext.family.name}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1.5 py-0.2 rounded text-[11px]">
                  {familyContext.family.familyCode}
                </span>
                <span>•</span>
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  {formatFamilyRoleDisplay(familyContext.memberRole)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Chưa tham gia gia đình nào
              </div>
              <Link href="/family">
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 text-xs gap-1 border-dashed border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 w-full"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Tham gia hoặc Tạo gia đình</span>
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
