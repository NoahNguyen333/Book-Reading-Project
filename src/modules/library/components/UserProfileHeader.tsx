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
import { updateUserProfileNameAction } from '@/modules/auth';
import { UserFamilyContext } from '@/modules/family/types';
import { formatFamilyRoleDisplay } from '@/modules/family/utils';
import { useLocale } from '@/lib/locale';

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
  const { t } = useLocale();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.fullName || '');
  const [currentName, setCurrentName] = useState(user.fullName || user.email?.split('@')[0] || t.nav.reader);
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError(t.profile.nameEmptyError);
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
    <div className="bg-[#FFFFFF] dark:bg-[#20201C] p-5 sm:p-7 rounded-2xl border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs space-y-4">
      {/* Top row: Editorial Greeting & Inline Edit */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#23211E] dark:text-[#EDE9E1] tracking-tight">
              {t.profile.greeting}
            </h1>

            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  disabled={isSaving}
                  className="px-2.5 py-0.5 font-serif text-xl sm:text-2xl font-bold rounded-lg border border-[#C25E38] focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg bg-[#C25E38] hover:bg-[#AF512E] text-white transition disabled:opacity-50"
                  title={t.profile.saveName}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg bg-[#EFECE4] hover:bg-[#E5E1D6] dark:bg-[#2A2925] dark:hover:bg-[#34332E] text-[#706B63] dark:text-[#EDE9E1] transition"
                  title={t.common.cancel}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-2xl sm:text-3xl font-bold text-[#C25E38] dark:text-[#D97750]">
                  {currentName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(currentName);
                    setIsEditingName(true);
                  }}
                  className="p-1 text-[#706B63] hover:text-[#C25E38] dark:hover:text-[#D97750] rounded-lg hover:bg-[#F7F4EE] dark:hover:bg-[#252420] transition"
                  title={t.profile.editName}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {nameError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{nameError}</p>
          )}

          <p className="text-xs sm:text-sm text-[#706B63] dark:text-[#999388] max-w-2xl leading-relaxed">
            {t.profile.description}
          </p>
        </div>

        {/* Discreet Session Status */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EFECE4] dark:bg-[#252420] text-[#5B7065] dark:text-[#8FA196] text-xs font-medium border border-[#E0DBD0] dark:border-[#2E2D28] self-start sm:self-auto shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#5B7065] dark:text-[#8FA196]" />
          <span>{t.profile.readyStatus}</span>
        </div>
      </div>

      {/* Slim Meta Strip: Account, Role, and Family Link */}
      <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-3 border-t border-[#E6E1D6] dark:border-[#2B2A26] text-xs text-[#706B63] dark:text-[#999388]">
        {/* Email */}
        <div className="inline-flex items-center gap-1.5 truncate max-w-[240px]">
          <UserIcon className="w-3.5 h-3.5 text-[#706B63] shrink-0" />
          <span className="truncate" title={user.email || ''}>{user.email}</span>
        </div>

        <span className="text-[#D5D0C5] dark:text-[#3A3833] hidden sm:inline">•</span>

        {/* Role Badge */}
        <div className="inline-flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#706B63] shrink-0" />
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider ${
              isSuperAdmin
                ? 'bg-[#FDF0EC] text-[#C25E38] border border-[#F4D3C7] dark:bg-[#281C18] dark:text-[#E08A6C] dark:border-[#3E2822]'
                : 'bg-[#EFECE4] text-[#555047] border border-[#E0DBD0] dark:bg-[#282723] dark:text-[#C4BEB3] dark:border-[#34322C]'
            }`}
          >
            {isSuperAdmin ? t.profile.roleSuperAdmin : t.profile.roleReader}
          </span>
        </div>

        <span className="text-[#D5D0C5] dark:text-[#3A3833] hidden sm:inline">•</span>

        {/* Family Affiliation */}
        <div className="inline-flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-[#706B63] shrink-0" />
          {familyContext ? (
            <Link
              href="/family"
              className="inline-flex items-center gap-1 text-[#23211E] dark:text-[#EDE9E1] hover:text-[#C25E38] dark:hover:text-[#D97750] font-medium transition"
            >
              <span>{familyContext.family.name}</span>
              <span className="font-mono text-[10px] bg-[#EFECE4] dark:bg-[#282723] px-1.5 py-0.2 rounded text-[#706B63] dark:text-[#999388]">
                {familyContext.family.familyCode}
              </span>
              <span className="text-[#C25E38] dark:text-[#D97750]">
                ({formatFamilyRoleDisplay(familyContext.memberRole)})
              </span>
              <ArrowRight className="w-3 h-3 text-[#706B63]" />
            </Link>
          ) : (
            <Link
              href="/family"
              className="inline-flex items-center gap-1 text-[#C25E38] dark:text-[#D97750] hover:underline font-medium"
            >
              <Users className="w-3 h-3" />
              <span>{t.profile.notInFamily}</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
