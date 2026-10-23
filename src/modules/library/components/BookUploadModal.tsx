'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui';
import { Upload, X, FileText, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { validateFileBasics, validateAndExtractMetadata, BookMetadata } from '../validation';
import { registerUploadedBookAction } from '../actions';

interface BookUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function BookUploadModal({ isOpen, onClose, tenantId }: BookUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedMetadata, setExtractedMetadata] = useState<BookMetadata | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelection = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);

    const basicCheck = validateFileBasics(selectedFile.name, selectedFile.size, selectedFile.type);
    if (!basicCheck.isValid) {
      setError(basicCheck.error || 'Invalid file');
      return;
    }

    setIsParsing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = await validateAndExtractMetadata(selectedFile.name, buffer, selectedFile.type);

      if (result.isValid && result.metadata) {
        setExtractedMetadata(result.metadata);
        setTitle(result.metadata.title || '');
        setAuthor(result.metadata.author || '');
        setDescription(result.metadata.description || '');
      } else {
        setError(result.error || 'Unable to parse document.');
      }
    } catch (err) {
      setError(`Failed to inspect file: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an EPUB or PDF file.');
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const format =
        extractedMetadata?.format ||
        (file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub');
      const bookId = crypto.randomUUID();
      const storagePath = `${tenantId}/${bookId}.${format}`;

      setUploadStatus('Uploading file directly to secure vault...');
      const supabase = createClient();
      const contentType =
        file.type || (format === 'pdf' ? 'application/pdf' : 'application/epub+zip');

      // 1. Direct client-to-storage upload (bypasses Vercel 4.5MB Serverless Function ceiling)
      const { error: storageError } = await supabase.storage
        .from('books')
        .upload(storagePath, file, {
          contentType,
          upsert: true,
        });

      if (storageError) {
        setError(`Storage upload failed: ${storageError.message}`);
        setIsUploading(false);
        setUploadStatus(null);
        return;
      }

      // 2. Direct cover upload to storage if thumbnail was extracted
      let coverPath: string | null = null;
      if (extractedMetadata?.coverDataUrl) {
        try {
          setUploadStatus('Saving cover preview...');
          const coverBlob = await (await fetch(extractedMetadata.coverDataUrl)).blob();
          const cPath = `${tenantId}/${bookId}-cover.jpg`;
          const { error: coverErr } = await supabase.storage
            .from('books')
            .upload(cPath, coverBlob, {
              contentType: 'image/jpeg',
              upsert: true,
            });
          if (!coverErr) {
            coverPath = cPath;
          }
        } catch {
          // Non-fatal if cover thumbnail upload encounters an issue
        }
      }

      // 3. Lightweight Server Action (< 2KB string metadata only)
      setUploadStatus('Registering book in family catalog...');
      const res = await registerUploadedBookAction({
        tenantId,
        bookId,
        title: title.trim() || extractedMetadata?.title || 'Untitled Document',
        author: author.trim() || extractedMetadata?.author || null,
        description: description.trim() || extractedMetadata?.description || null,
        format,
        storagePath,
        coverPath,
        fileSize: file.size,
        pageCount: extractedMetadata?.pageCount || null,
      });

      if (res.error) {
        setError(res.error);
      } else {
        // Reset and close
        setFile(null);
        setExtractedMetadata(null);
        setTitle('');
        setAuthor('');
        setDescription('');
        onClose();
      }
    } catch (err) {
      setError(
        `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl shadow-xl border border-[#E6E1D6] dark:border-[#2B2A26] p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E1D6] dark:border-[#2B2A26] pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#FDF0EC] text-[#C25E38] dark:bg-[#281C18] dark:text-[#E08A6C] border border-[#F4D3C7] dark:border-[#3E2822]">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#23211E] dark:text-[#EDE9E1]">Tải sách lên</h2>
              <p className="text-xs text-[#706B63] dark:text-[#999388]">Định dạng EPUB hoặc PDF (tối đa 50 MB)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#706B63] hover:text-[#23211E] dark:hover:text-[#EDE9E1] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              file
                ? 'border-[#C25E38] bg-[#FDF0EC]/40 dark:border-[#D97750] dark:bg-[#281C18]/30'
                : 'border-[#E6E1D6] dark:border-[#2B2A26] hover:border-[#C25E38] dark:hover:border-[#D97750]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf,application/epub+zip,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelection(e.target.files[0]);
                }
              }}
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-[#C25E38] dark:text-[#D97750]" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-xs">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drag and drop an EPUB or PDF file here, or{' '}
                  <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                </p>
                <p className="text-xs text-gray-400">Standard EPUB books or PDF documents</p>
              </div>
            )}
          </div>

          {/* Metadata Auto-Extraction Banner */}
          {isParsing && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing document structure and extracting metadata...</span>
            </div>
          )}

          {extractedMetadata && (
            <div className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
              {extractedMetadata.coverDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={extractedMetadata.coverDataUrl}
                  alt="Cover preview"
                  className="w-14 h-20 object-cover rounded-md shadow-sm border border-gray-200 dark:border-gray-700 shrink-0"
                />
              ) : (
                <div className="w-14 h-20 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 shrink-0">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div className="text-xs space-y-1">
                <div className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Metadata auto-extracted from EPUB</span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-xs">
                  {extractedMetadata.title}
                </p>
                {extractedMetadata.author && (
                  <p className="text-gray-500">By {extractedMetadata.author}</p>
                )}
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book Title"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author Name"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short synopsis..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isUploading || !file || isParsing}
              className="gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadStatus || 'Uploading to Vault...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload Book</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
