import Link from 'next/link';
import { BookOpen, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-[#F7F4EE] via-[#FBF8F1] to-white dark:from-[#161614] dark:via-[#1B1B18] dark:to-[#20201C] text-center">
      <div className="max-w-md w-full bg-white dark:bg-[#20201C] border border-[#E6E1D6] dark:border-[#2E2D28] rounded-2xl p-8 sm:p-10 shadow-xs space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100/70 dark:bg-amber-950/40 text-[#C25E38] dark:text-[#D97750] shadow-2xs">
          <BookOpen className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#F3E2B4]/50 text-[#8C4318] dark:bg-amber-950/60 dark:text-amber-300">
            404 &bull; Not Found
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#23211E] dark:text-[#EDE9E1] tracking-tight">
            Trang không tìm thấy
          </h1>
          <p className="text-sm text-[#706B63] dark:text-[#999388] leading-relaxed">
            Trang hoặc cuốn sách bạn đang tìm kiếm có thể đã được chuyển đi, đổi tên hoặc tạm thời không khả dụng.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link href="/" className="flex-1">
            <Button variant="primary" size="md" className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Về trang chủ</span>
            </Button>
          </Link>
          <Link href="/dashboard" className="flex-1">
            <Button variant="outline" size="md" className="w-full gap-2">
              <Home className="w-4 h-4" />
              <span>Thư viện</span>
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
