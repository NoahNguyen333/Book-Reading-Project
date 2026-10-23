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
  const displayName = userName || userEmail?.split('@')[0] || 'Reader';

  const roleDisplay = isSuperAdmin
    ? 'Super Admin'
    : familyRole
    ? `Family ${familyRole}`
    : role.toLowerCase() === 'admin'
    ? 'Admin'
    : 'Reader';

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md sticky top-0 z-30 transition">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Section: Brand & Active Space */}
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 shrink-0 group focus:outline-none"
          >
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm group-hover:bg-blue-500 transition">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white tracking-tight hidden sm:inline-block">
              Family Reading Room
            </span>
          </Link>

          <div className="hidden md:block h-4 w-px bg-gray-200 dark:border-gray-800" />

          {/* Family Space Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50 truncate max-w-[200px]">
            <Home className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{familyName || tenantName}</span>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-2">
          {/* Dashboard / Library */}
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activePath === '/dashboard'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Thư viện</span>
          </Link>

          {/* Family Hub */}
          <Link
            href="/family"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activePath === '/family'
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Gia đình</span>
          </Link>

          {/* Notebook */}
          <Link
            href="/notebook"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activePath === '/notebook'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <BookMarked className="w-4 h-4 text-amber-500" />
            <span>Sổ tay</span>
          </Link>

          {/* Collaborative Rooms */}
          <Link
            href="/room"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activePath.startsWith('/room')
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Radio
              className={`w-4 h-4 ${
                liveRoomsCount > 0 ? 'text-emerald-500 animate-pulse' : 'text-purple-500'
              }`}
            />
            <span>Phòng đọc</span>
            {liveRoomsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {liveRoomsCount}
              </span>
            )}
          </Link>
        </nav>

        {/* Right Section: User Profile & Role & Sign Out */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[160px]">
              {displayName}
            </span>
            <div className="flex items-center gap-1 text-[10px]">
              <span
                className={`inline-flex items-center gap-1 font-semibold uppercase px-1.5 py-0.2 rounded text-[9px] ${
                  isSuperAdmin
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
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
              className="gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
