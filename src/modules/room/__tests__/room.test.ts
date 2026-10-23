import { describe, it, expect } from 'vitest';
import {
  transformPresenceState,
  shouldFollowHost,
  identifyMeetingProvider,
  mergeRoomSessionState,
} from '../utils';
import { RoomSessionState } from '../types';

describe('Room Domain Utilities & Collaborative Sync Engine', () => {
  describe('transformPresenceState', () => {
    it('transforms presence dictionary and deduplicates to latest presence entry', () => {
      const presenceState = {
        'user-1': [
          { userId: 'user-1', userName: 'Alice', isHost: false, joinedAt: '2026-10-23T10:00:00Z' },
          { userId: 'user-1', userName: 'Alice Updated', isHost: true, joinedAt: '2026-10-23T10:05:00Z' },
        ],
        'user-2': [
          { userId: 'user-2', userName: 'Bob', isHost: false, joinedAt: '2026-10-23T10:01:00Z' },
        ],
      };

      const result = transformPresenceState(presenceState, 'user-2');

      expect(result).toHaveLength(2);
      // Host (Alice Updated) should be first
      expect(result[0].userId).toBe('user-1');
      expect(result[0].userName).toBe('Alice Updated');
      expect(result[0].isHost).toBe(true);

      // Followed by current user (Bob)
      expect(result[1].userId).toBe('user-2');
      expect(result[1].userName).toBe('Bob');
    });

    it('handles email fallback when userName is not explicitly set', () => {
      const presenceState = {
        'user-3': [
          { email: 'charlie@family.org', joinedAt: '2026-10-23T10:00:00Z' },
        ],
      };

      const result = transformPresenceState(presenceState);
      expect(result[0].userId).toBe('user-3');
      expect(result[0].userName).toBe('charlie');
    });

    it('returns empty array when presence dictionary is empty', () => {
      expect(transformPresenceState({})).toEqual([]);
    });
  });

  describe('shouldFollowHost', () => {
    it('returns true when following is enabled, user is not host, and host is at a different location', () => {
      expect(shouldFollowHost(true, 'page:5', 'page:1', false)).toBe(true);
      expect(shouldFollowHost(true, 'epubcfi(/6/4[chap02]!)', 'epubcfi(/6/2[chap01]!)', false)).toBe(true);
    });

    it('returns false when following is disabled', () => {
      expect(shouldFollowHost(false, 'page:5', 'page:1', false)).toBe(false);
    });

    it('returns false if current user is the host', () => {
      expect(shouldFollowHost(true, 'page:5', 'page:1', true)).toBe(false);
    });

    it('returns false when host location is missing or empty', () => {
      expect(shouldFollowHost(true, null, 'page:1', false)).toBe(false);
      expect(shouldFollowHost(true, undefined, 'page:1', false)).toBe(false);
      expect(shouldFollowHost(true, '', 'page:1', false)).toBe(false);
    });

    it('returns false when reader is already on the same page (no drift)', () => {
      expect(shouldFollowHost(true, 'page:5', 'page:5', false)).toBe(false);
      expect(shouldFollowHost(true, 'epubcfi(/6/4!)', 'epubcfi(/6/4!)', false)).toBe(false);
    });
  });

  describe('identifyMeetingProvider', () => {
    it('identifies Google Meet URLs', () => {
      const info = identifyMeetingProvider('https://meet.google.com/xyz-abcd-efg');
      expect(info.name).toBe('Google Meet');
      expect(info.isSupported).toBe(true);
    });

    it('identifies Zoom URLs', () => {
      const info = identifyMeetingProvider('https://us04web.zoom.us/j/8492049102');
      expect(info.name).toBe('Zoom');
      expect(info.isSupported).toBe(true);
    });

    it('identifies Microsoft Teams URLs', () => {
      const info = identifyMeetingProvider('https://teams.microsoft.com/l/meetup-join/19%3ameeting...');
      expect(info.name).toBe('MS Teams');
      expect(info.isSupported).toBe(true);
    });

    it('identifies Jitsi Meet URLs', () => {
      const info = identifyMeetingProvider('https://meet.jit.si/FamilyEveningStory');
      expect(info.name).toBe('Jitsi Meet');
      expect(info.isSupported).toBe(true);
    });

    it('identifies generic video call URLs', () => {
      const info = identifyMeetingProvider('https://custom-call.provider.com/room123');
      expect(info.name).toBe('Video Call');
      expect(info.isSupported).toBe(true);
    });

    it('returns isSupported false for null or empty URLs', () => {
      expect(identifyMeetingProvider(null).isSupported).toBe(false);
      expect(identifyMeetingProvider('').isSupported).toBe(false);
      expect(identifyMeetingProvider('   ').isSupported).toBe(false);
    });
  });

  describe('mergeRoomSessionState', () => {
    it('accepts incoming state if timestamp is newer', () => {
      const current: RoomSessionState = {
        location: 'page:1',
        percentage: 10,
        updatedAt: '2026-10-23T10:00:00Z',
      };
      const incoming: RoomSessionState = {
        location: 'page:2',
        percentage: 20,
        updatedAt: '2026-10-23T10:00:05Z',
      };

      const merged = mergeRoomSessionState(current, incoming);
      expect(merged.location).toBe('page:2');
      expect(merged.percentage).toBe(20);
    });

    it('rejects stale incoming state if timestamp is older', () => {
      const current: RoomSessionState = {
        location: 'page:10',
        percentage: 50,
        updatedAt: '2026-10-23T10:05:00Z',
      };
      const staleIncoming: RoomSessionState = {
        location: 'page:2',
        percentage: 10,
        updatedAt: '2026-10-23T10:01:00Z',
      };

      const merged = mergeRoomSessionState(current, staleIncoming);
      expect(merged.location).toBe('page:10');
      expect(merged.percentage).toBe(50);
    });

    it('merges cleanly when timestamps are missing', () => {
      const current: RoomSessionState = { location: 'page:1', percentage: 10 };
      const incoming: RoomSessionState = { location: 'page:5', percentage: 40 };

      const merged = mergeRoomSessionState(current, incoming);
      expect(merged.location).toBe('page:5');
      expect(merged.percentage).toBe(40);
    });
  });
});
