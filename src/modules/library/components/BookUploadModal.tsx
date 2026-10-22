'use client';

import React, { useState, useTransition, useRef } from 'react';
import { Button } from '@/components/ui';
import { Upload, X, FileText, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { validateFileBasics, validateAndExtractEpubMetadata, EpubMetadata } from '../validation';
import { uploadBookAction } from '../actions';

interface BookUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function BookUploadModal({ isOpen, onClose, tenantId }: BookUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedMetadata, setExtractedMetadata] = useState<EpubMetadata | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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
      const result = await validateAndExtractEpubMetadata(buffer);

      if (result.isValid && result.metadata) {
        setExtractedMetadata(result.metadata);
        setTitle(result.metadata.title || '');
        setAuthor(result.metadata.author || '');
        setDescription(result.metadata.description || '');
      } else {
        setError(result.error || 'Unable to parse EPUB container.');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an EPUB file.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('file', file);
      formData.append('title', title);
      formData.append('author', author);
      formData.append('description', description);

      const res = await uploadBookAction(null, formData);
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
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upload Book</h2>
              <p className="text-xs text-gray-500">EPUB format (up to 50 MB)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
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
                ? 'border-blue-400 bg-blue-50/30 dark:border-blue-700 dark:bg-blue-950/20'
                : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,application/epub+zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelection(e.target.files[0]);
                }
              }}
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
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
                  Drag and drop an EPUB file here, or{' '}
                  <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                </p>
                <p className="text-xs text-gray-400">Standard EPUB 2 or EPUB 3 archives</p>
              </div>
            )}
          </div>

          {/* Metadata Auto-Extraction Banner */}
          {isParsing && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing EPUB structure and extracting metadata...</span>
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
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !file || isParsing}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading to Vault...</span>
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
