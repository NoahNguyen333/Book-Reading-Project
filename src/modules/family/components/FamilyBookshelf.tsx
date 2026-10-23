'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Plus,
  Trash2,
  Radio,
  Search,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Book } from '@/modules/library/types';
import { FamilyRole } from '../types';
import { canManageFamilyBooks } from '../utils';
import {
  addBookToFamilyBookshelfAction,
  removeBookFromFamilyBookshelfAction,
} from '../actions';

interface FamilyBookshelfProps {
  familyId: string;
  memberRole: FamilyRole;
  familyBooks: Book[];
  allPublicBooks: Book[];
}

export function FamilyBookshelf({
  familyId,
  memberRole,
  familyBooks,
  allPublicBooks,
}: FamilyBookshelfProps) {
  const router = useRouter();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [removingBookId, setRemovingBookId] = useState<string | null>(null);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  const canManage = canManageFamilyBooks(memberRole);

  const existingBookIds = useMemo(() => {
    return new Set(familyBooks.map((b) => b.id));
  }, [familyBooks]);

  const filteredFamilyBooks = useMemo(() => {
    if (!searchQuery.trim()) return familyBooks;
    const q = searchQuery.toLowerCase();
    return familyBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q))
    );
  }, [familyBooks, searchQuery]);

  const availableBooksToAdd = useMemo(() => {
    const unadded = allPublicBooks.filter((b) => !existingBookIds.has(b.id));
    if (!modalSearchQuery.trim()) return unadded;
    const q = modalSearchQuery.toLowerCase();
    return unadded.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q))
    );
  }, [allPublicBooks, existingBookIds, modalSearchQuery]);

  const handleAddBook = async (bookId: string) => {
    setAddingBookId(bookId);
    try {
      const res = await addBookToFamilyBookshelfAction(familyId, bookId);
      if (!res.error) {
        router.refresh();
      }
    } finally {
      setAddingBookId(null);
    }
  };

  const handleRemoveBook = async (bookId: string) => {
    setRemovingBookId(bookId);
    try {
      const res = await removeBookFromFamilyBookshelfAction(familyId, bookId);
      if (!res.error) {
        router.refresh();
      }
    } finally {
      setRemovingBookId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Tủ sách gia đình (Family Bookshelf)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              {familyBooks.length} cuốn
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Các đầu sách được chọn lọc từ thư viện để gia đình cùng đọc, đồng bộ trang và mở phòng thảo luận.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {canManage && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-500 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm sách vào tủ</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter / Search if books exist */}
      {familyBooks.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm trong tủ sách gia đình..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      )}

      {/* Bookshelf Grid or Empty state */}
      {familyBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl space-y-4">
          <div className="p-3.5 rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              Tủ sách gia đình đang trống
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canManage
                ? 'Hãy thêm những cuốn sách hay từ kho thư viện chung vào đây để mọi người cùng thưởng thức.'
                : 'Quản trị viên gia đình chưa tuyển chọn sách cho tủ. Hãy đề xuất sách mới nhé!'}
            </p>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-500 text-white mt-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tuyển chọn sách đầu tiên</span>
            </Button>
          )}
        </div>
      ) : filteredFamilyBooks.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-500">
          Không tìm thấy sách nào khớp với từ khóa tìm kiếm.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFamilyBooks.map((book) => (
            <div
              key={book.id}
              className="group relative flex flex-col justify-between bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200/80 dark:border-gray-700/70 p-4 hover:shadow-md transition"
            >
              <div className="space-y-3">
                {/* Book Format Tag & Remove Button */}
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    {book.format}
                  </span>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBook(book.id)}
                      disabled={removingBookId === book.id}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      title="Gỡ khỏi tủ sách gia đình"
                    >
                      {removingBookId === book.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Title & Author */}
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2" title={book.title}>
                    {book.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                    {book.author || 'Chưa rõ tác giả'}
                  </p>
                </div>
              </div>

              {/* Actions: Solo Read or Collaborative Room */}
              <div className="flex items-center gap-2 pt-4 border-t border-gray-200/60 dark:border-gray-700/60 mt-4">
                <Link
                  href={`/reader/${book.id}`}
                  className="flex-1 text-center py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  Đọc ngay
                </Link>

                <Link
                  href={`/room?bookId=${book.id}`}
                  className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-semibold border border-purple-200 dark:border-purple-800 transition"
                  title="Mở phòng đọc chung"
                >
                  <Radio className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Phòng đọc</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Books Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                    Tuyển chọn sách vào tủ gia đình
                  </h3>
                  <p className="text-xs text-gray-500">
                    Chọn các cuốn sách từ kho thư viện chung
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal search */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm sách theo tiêu đề hoặc tác giả..."
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Books List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
              {availableBooksToAdd.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">
                  {modalSearchQuery.trim()
                    ? 'Không tìm thấy sách nào phù hợp.'
                    : 'Tất cả sách trong thư viện đã được thêm vào tủ gia đình.'}
                </div>
              ) : (
                availableBooksToAdd.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs"
                  >
                    <div className="truncate mr-3">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {b.title}
                      </div>
                      <div className="text-gray-500 text-[11px] truncate">
                        {b.author || 'Chưa rõ tác giả'} • <span className="uppercase">{b.format}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleAddBook(b.id)}
                      disabled={addingBookId === b.id}
                      className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white shrink-0 text-xs h-8"
                    >
                      {addingBookId === b.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Thêm</span>
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
