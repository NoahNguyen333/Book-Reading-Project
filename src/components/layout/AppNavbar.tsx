'use client';

import React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Home,
  LogOut,
  Shield,
  LayoutDashboard,
  BookMarked,
  Users,
  Radio,
} from 'lucide-react';
import { signOut } from '@/modules/auth';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/locale';

export interface AppNavbarProps {
  activePath?: string;
  userName?: string | null;
  userEmail?: string;
  tenantName?: string;
  role?: string;
  familyName?: string | null;
  familyRole?: string | null;
  isSuperAdmin?: boolean;
  liveRoomsCount?: number;
}

export function AppNavbar({
  activePath = '/dashboard',
  userName,
  userEmail,
  tenantName = 'Solo Library',
  role = 'reader',
  familyName,
  familyRole,
  isSuperAdmin = false,
  liveRoomsCount = 0,
}: AppNavbarProps) {
  const { locale, setLocale, t } = useLocale();
  const displayName = userName || userEmail?.split('@')[0] || t.nav.reader;

  const roleDisplay = isSuperAdmin
    ? t.nav.superAdmin
    : familyRole
    ? `Family ${familyRole}`
    : role.toLowerCase() === 'admin'
    ? t.nav.admin
    : t.nav.reader;

  const spaceDisplay = familyName || (tenantName === 'Solo Library' ? t.nav.soloSpace : tenantName);

  return (
    <header className="border-b border-[#E6E1D6] dark:border-[#2B2A26] bg-[#F7F4EE]/90 dark:bg-[#161614]/90 backdrop-blur-md sticky top-0 z-30 transition">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Section: Brand & Space */}
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 shrink-0 group focus:outline-none"
          >
            <div className="p-2 bg-[#C25E38] text-white rounded-xl shadow-xs group-hover:bg-[#AF512E] transition">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-serif font-bold text-base sm:text-lg text-[#23211E] dark:text-[#EDE9E1] tracking-tight hidden sm:inline-block">
              Family Reading Room
            </span>
          </Link>

          <div className="hidden md:block h-4 w-px bg-[#E6E1D6] dark:border-[#2B2A26]" />

          {/* Family Space Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFECE4] dark:bg-[#20201C] text-xs font-medium text-[#555047] dark:text-[#B5AFA4] border border-[#E0DBD0] dark:border-[#2B2A26] truncate max-w-[200px]">
            <Home className="w-3.5 h-3.5 text-[#706B63] dark:text-[#999388] shrink-0" />
            <span className="truncate">{spaceDisplay}</span>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-2">
          {/* Dashboard / Library */}
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition ${
              activePath === '/dashboard'
                ? 'bg-[#EAE5D9] text-[#C25E38] dark:bg-[#252420] dark:text-[#D97750] font-semibold shadow-xs'
                : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1] hover:bg-[#EFECE4] dark:hover:bg-[#20201C]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>{t.nav.library}</span>
          </Link>

          {/* Family Hub */}
          <Link
            href="/family"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition ${
              activePath === '/family'
                ? 'bg-[#EAE5D9] text-[#C25E38] dark:bg-[#252420] dark:text-[#D97750] font-semibold shadow-xs'
                : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1] hover:bg-[#EFECE4] dark:hover:bg-[#20201C]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t.nav.family}</span>
          </Link>

          {/* Notebook */}
          <Link
            href="/notebook"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition ${
              activePath === '/notebook'
                ? 'bg-[#EAE5D9] text-[#C25E38] dark:bg-[#252420] dark:text-[#D97750] font-semibold shadow-xs'
                : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1] hover:bg-[#EFECE4] dark:hover:bg-[#20201C]'
            }`}
          >
            <BookMarked className="w-4 h-4 text-[#C25E38] dark:text-[#D97750]" />
            <span>{t.nav.notebook}</span>
          </Link>

          {/* Collaborative Rooms */}
          <Link
            href="/room"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition ${
              activePath.startsWith('/room')
                ? 'bg-[#EAE5D9] text-[#C25E38] dark:bg-[#252420] dark:text-[#D97750] font-semibold shadow-xs'
                : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1] hover:bg-[#EFECE4] dark:hover:bg-[#20201C]'
            }`}
          >
            <Radio
              className={`w-4 h-4 ${
                liveRoomsCount > 0 ? 'text-[#C25E38] animate-pulse' : 'text-[#706B63]'
              }`}
            />
            <span>{t.nav.room}</span>
            {liveRoomsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FDF0EC] text-[#C25E38] dark:bg-[#281C18] dark:text-[#E08A6C] border border-[#F4D3C7] dark:border-[#3E2822]">
                {liveRoomsCount}
              </span>
            )}
          </Link>
        </nav>

        {/* Right Section: Language Toggle, User Profile & Role & Sign Out */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Minimalist VI | EN Language Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-[#EFECE4] dark:bg-[#20201C] border border-[#E0DBD0] dark:border-[#2B2A26] text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setLocale('vi')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                locale === 'vi'
                  ? 'bg-[#FFFFFF] dark:bg-[#2A2925] text-[#C25E38] dark:text-[#D97750] shadow-2xs font-bold'
                  : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1]'
              }`}
              title="Tiếng Việt"
            >
              VI
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                locale === 'en'
                  ? 'bg-[#FFFFFF] dark:bg-[#2A2925] text-[#C25E38] dark:text-[#D97750] shadow-2xs font-bold'
                  : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1]'
              }`}
              title="English"
            >
              EN
            </button>
          </div>

          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="text-xs font-semibold text-[#23211E] dark:text-[#EDE9E1] truncate max-w-[160px]">
              {displayName}
            </span>
            <div className="flex items-center gap-1 text-[10px]">
              <span
                className={`inline-flex items-center gap-1 font-semibold uppercase px-1.5 py-0.2 rounded text-[9px] ${
                  isSuperAdmin
                    ? 'bg-[#FDF0EC] text-[#C25E38] border border-[#F4D3C7] dark:bg-[#281C18] dark:text-[#E08A6C] dark:border-[#3E2822]'
                    : 'bg-[#EFECE4] text-[#5B7065] border border-[#D5D0C5] dark:bg-[#20201C] dark:text-[#8FA196] dark:border-[#2E2D28]'
                }`}
              >
                <Shield className="w-2.5 h-2.5" />
                <span>{roleDisplay}</span>
              </span>
            </div>
          </div>

          <form action={signOut}>
            <Button
              variant="outline"
              size="sm"
              type="submit"
              className="gap-1.5 text-xs text-[#706B63] dark:text-[#999388] hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition"
              title={t.nav.signOut}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.nav.signOut}</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
