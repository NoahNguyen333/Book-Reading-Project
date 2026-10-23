import React from 'react';
import { BookOpen, ArrowLeft, Loader2 } from 'lucide-react';

export default function ReaderLoading() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1]">
      {/* Top Navigation Skeleton Bar */}
      <header className="h-14 border-b border-[#E6E1D6] dark:border-[#2B2A26] bg-[#FFFFFF]/80 dark:bg-[#20201C]/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#706B63] dark:text-[#999388] bg-[#EFECE4] dark:bg-[#2A2925] opacity-60">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Thư viện</span>
          </div>
          <div className="h-4 w-32 bg-[#EFECE4] dark:bg-[#2A2925] rounded-md animate-pulse" />
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#EFECE4] dark:bg-[#2A2925] animate-pulse" />
          <div className="w-8 h-8 rounded-lg bg-[#EFECE4] dark:bg-[#2A2925] animate-pulse" />
          <div className="w-8 h-8 rounded-lg bg-[#EFECE4] dark:bg-[#2A2925] animate-pulse" />
        </div>
      </header>

      {/* Main Centered Book Loading Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative w-36 sm:w-44 aspect-[3/4] rounded-r-xl rounded-l-xs bg-[#FFFFFF] dark:bg-[#20201C] border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xl overflow-hidden mb-6 flex flex-col items-center justify-center p-4">
          {/* Simulated spine highlight */}
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10 pointer-events-none" />

          {/* Book cover pulsing silhouette */}
          <div className="w-12 h-12 rounded-2xl bg-[#FDF0EC] dark:bg-[#281C18] flex items-center justify-center text-[#C25E38] dark:text-[#E08A6C] mb-3">
            <BookOpen className="w-6 h-6 animate-pulse" />
          </div>

          <div className="w-24 h-2.5 bg-[#EFECE4] dark:bg-[#2A2925] rounded-full animate-pulse mb-2" />
          <div className="w-16 h-2 bg-[#EFECE4] dark:bg-[#2A2925] rounded-full animate-pulse" />
        </div>

        {/* Editorial status text */}
        <div className="space-y-1.5 max-w-sm">
          <div className="inline-flex items-center gap-2 text-sm font-semibold font-serif text-[#23211E] dark:text-[#EDE9E1]">
            <Loader2 className="w-4 h-4 text-[#C25E38] dark:text-[#D97750] animate-spin" />
            <span>Đang mở sách / Opening book...</span>
          </div>
          <p className="text-xs text-[#706B63] dark:text-[#999388]">
            Đang tải dữ liệu và đồng bộ trang đọc cá nhân
          </p>
        </div>
      </main>
    </div>
  );
}
