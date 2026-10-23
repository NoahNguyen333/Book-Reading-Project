'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { AnnotationComment } from '../annotations/types';
import {
  getAnnotationCommentsAction,
  createCommentAction,
  deleteCommentAction,
} from '../annotations/actions';
import {
  formatRelativeCommentTime,
  getUserInitials,
  canDeleteComment,
  validateCommentContent,
} from '../annotations/utils';

interface AnnotationThreadProps {
  annotationId: string;
  tenantId: string;
  currentUserId?: string;
  isAdmin?: boolean;
  bookId?: string;
}

export function AnnotationThread({
  annotationId,
  tenantId,
  currentUserId,
  isAdmin = false,
  bookId,
}: AnnotationThreadProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [comments, setComments] = useState<AnnotationComment[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAnnotationCommentsAction(annotationId, tenantId);
      if (res.data) {
        setComments(res.data);
      } else if (res.error) {
        setError(res.error);
      }
    } catch {
      setError('Unable to load discussion replies.');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [annotationId, tenantId]);

  useEffect(() => {
    if (isExpanded && !hasLoaded) {
      loadComments();
    }
  }, [isExpanded, hasLoaded, loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const validation = validateCommentContent(content);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid reply.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await createCommentAction(
        annotationId,
        tenantId,
        validation.cleanContent,
        bookId
      );

      if (res.data) {
        setComments((prev) => [...prev, res.data!]);
        setContent('');
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, commentId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this comment?')) return;

    setDeletingId(commentId);
    try {
      const res = await deleteCommentAction(commentId, tenantId, bookId);
      if (res.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else if (res.error) {
        alert(res.error);
      }
    } catch {
      alert('Failed to delete comment.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800/80 text-xs"
    >
      {/* Toggle Discussion Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition font-medium text-[11px]"
      >
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
          <span>Discussion</span>
          {comments.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {comments.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <span>{isExpanded ? 'Hide' : 'Reply'}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {/* Expanded Comments & Input */}
      {isExpanded && (
        <div className="mt-2 space-y-3 animate-in fade-in duration-150">
          {isLoading && (
            <div className="flex items-center justify-center py-3 text-gray-400 gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span className="text-[11px]">Loading replies...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Comment List */}
          {!isLoading && comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((comment) => {
                const initials = getUserInitials(comment.userName, comment.userEmail);
                const timeAgo = formatRelativeCommentTime(comment.createdAt);
                const isDeletable = canDeleteComment(
                  comment.userId,
                  currentUserId,
                  isAdmin
                );

                return (
                  <div
                    key={comment.id}
                    className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center font-bold text-[9px]">
                          {initials}
                        </div>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {comment.userName}
                        </span>
                        <span className="text-gray-400 text-[10px]">{timeAgo}</span>
                      </div>

                      {isDeletable && (
                        <button
                          type="button"
                          disabled={deletingId === comment.id}
                          onClick={(e) => handleDelete(e, comment.id)}
                          title="Delete reply"
                          className="p-1 rounded text-gray-400 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap pl-7 leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && comments.length === 0 && (
            <p className="text-[11px] text-gray-400 italic text-center py-1">
              No replies yet. Start the family discussion!
            </p>
          )}

          {/* Reply Form */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-center pt-1">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Reply to this passage..."
              maxLength={2000}
              disabled={isSubmitting}
              className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="p-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:hover:bg-blue-600 shrink-0"
              title="Post Reply"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}