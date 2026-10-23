'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { KeyRound, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { joinFamilyAction } from '../actions';
import { normalizeFamilyCode } from '../utils';

export function JoinFamilyCard() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = normalizeFamilyCode(code);
    if (!cleanCode) {
      setError('Vui lòng nhập mã gia đình.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await joinFamilyAction(cleanCode);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tham gia gia đình.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Gia nhập không gian có sẵn
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Nhập mã gia đình (Family ID, ví dụ: FAM-7K9P) do người thân chia sẻ.
          </p>
        </div>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        {error && (
          <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="FAM-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !code.trim()}
            className="gap-2 bg-purple-600 hover:bg-purple-500 text-white shrink-0 px-5"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Tham gia</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
