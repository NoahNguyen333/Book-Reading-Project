'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Copy,
  Check,
  LogOut,
  Shield,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Family, FamilyRole } from '../types';
import { formatFamilyRoleDisplay } from '../utils';
import { leaveFamilyAction } from '../actions';

interface FamilyHeaderProps {
  family: Family;
  memberRole: FamilyRole;
  memberCount: number;
}

export function FamilyHeader({
  family,
  memberRole,
  memberCount,
}: FamilyHeaderProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(family.familyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLeaveFamily = async () => {
    setIsLeaving(true);
    setLeaveError(null);

    try {
      const res = await leaveFamilyAction(family.id);
      if (res.error) {
        setLeaveError(res.error);
        setIsLeaving(false);
      } else {
        setShowLeaveConfirm(false);
        router.refresh();
      }
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Lỗi khi rời gia đình.');
      setIsLeaving(false);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                  {family.name}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {memberCount} {memberCount === 1 ? 'Thành viên' : 'Thành viên'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    <Shield className="w-3 h-3" />
                    <span>{formatFamilyRoleDisplay(memberRole)}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Family Code Copy Box */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">Mã gia đình:</span>
              <span className="font-mono font-bold text-sm text-purple-600 dark:text-purple-400">
                {family.familyCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1 rounded-md text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                title="Sao chép mã gia đình"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Leave Family Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLeaveConfirm(true)}
              className="gap-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900/50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Rời gia đình</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Leave Family Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Xác nhận rời gia đình?
              </h3>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Bạn sẽ không còn truy cập vào tủ sách riêng và phòng đọc của gia đình này nữa. Tiến độ đọc cá nhân của bạn trên các cuốn sách vẫn được bảo lưu.
            </p>

            {leaveError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                {leaveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={isLeaving}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleLeaveFamily}
                disabled={isLeaving}
                className="gap-2 bg-red-600 hover:bg-red-500 text-white"
              >
                {isLeaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                <span>Rời không gian</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
