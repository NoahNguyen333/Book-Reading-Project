'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui';
import { BookPlus, X, Loader2, CheckCircle2 } from 'lucide-react';
import { createBookRequestAction } from '@/modules/family/actions';

interface BookRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookRequestModal({ isOpen, onClose }: BookRequestModalProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề sách.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await createBookRequestAction(title, author, note);
      if (res.error) {
        setError(res.error);
      } else {
        setIsSuccess(true);
        setTimeout(() => {
          setTitle('');
          setAuthor('');
          setNote('');
          setIsSuccess(false);
          onClose();
        }, 1800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi yêu cầu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl shadow-xl border border-[#E6E1D6] dark:border-[#2B2A26] p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E1D6] dark:border-[#2B2A26] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FDF0EC] text-[#C25E38] dark:bg-[#281C18] dark:text-[#E08A6C] border border-[#F4D3C7] dark:border-[#3E2822]">
              <BookPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-base font-bold text-[#23211E] dark:text-[#EDE9E1]">
                Yêu cầu thêm sách
              </h2>
              <p className="text-xs text-[#706B63] dark:text-[#999388]">
                Gửi yêu cầu tới Platform Super Admin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#706B63] hover:text-[#23211E] dark:hover:text-[#EDE9E1] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#5B7065] dark:text-[#8FA196] mx-auto animate-bounce" />
            <h3 className="font-serif text-sm font-bold text-[#23211E] dark:text-[#EDE9E1]">
              Đã gửi yêu cầu thành công!
            </h3>
            <p className="text-xs text-[#706B63] dark:text-[#999388]">
              Admin sẽ sớm cập nhật cuốn sách &ldquo;{title}&rdquo; vào kho thư viện.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#23211E] dark:text-[#EDE9E1] mb-1">
                Tiêu đề sách <span className="text-[#C25E38]">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Dế Mèn Phiêu Lưu Ký, Atomic Habits..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E6E1D6] dark:border-[#2B2A26] bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1] focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 focus:border-[#C25E38]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#23211E] dark:text-[#EDE9E1] mb-1">
                Tác giả (tùy chọn)
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="VD: Tô Hoài, James Clear..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E6E1D6] dark:border-[#2B2A26] bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1] focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 focus:border-[#C25E38]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#23211E] dark:text-[#EDE9E1] mb-1">
                Ghi chú thêm (tùy chọn)
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Link tham khảo, lý do muốn đọc..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E6E1D6] dark:border-[#2B2A26] bg-[#F7F4EE] dark:bg-[#161614] text-[#23211E] dark:text-[#EDE9E1] focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 focus:border-[#C25E38]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E6E1D6] dark:border-[#2B2A26]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || !title.trim()}
                className="gap-1.5 bg-[#C25E38] hover:bg-[#AF512E] text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <BookPlus className="w-3.5 h-3.5" />
                    <span>Gửi yêu cầu</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
