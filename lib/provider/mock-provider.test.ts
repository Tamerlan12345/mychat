import { describe, it, expect } from 'vitest';
import { MockDataProvider } from './mock-provider';

describe('MockDataProvider conversation membership', () => {
  it('returns members with joined user profiles for a seeded group', async () => {
    const provider = new MockDataProvider('u1');
    const members = await provider.getConversationMembers('c1');

    expect(members.length).toBeGreaterThan(1);
    expect(members.every(m => m.conversation_id === 'c1')).toBe(true);
    expect(members.find(m => m.user_id === 'u1')?.role).toBe('ADMIN');
    expect(members.find(m => m.user_id === 'u2')?.user?.email).toBe('employee1@demo.local');
  });

  it('registers creator and invited members when a conversation is created', async () => {
    const provider = new MockDataProvider('u1');
    const conv = await provider.createConversation({
      type: 'GROUP',
      name: 'Новая группа',
      created_by: 'u1',
      member_ids: ['u1', 'u3'],
    });
    const members = await provider.getConversationMembers(conv.id);

    expect(members.map(m => m.user_id).sort()).toEqual(['u1', 'u3']);
    expect(members.find(m => m.user_id === 'u1')?.role).toBe('ADMIN');
  });

  it('adds and removes members', async () => {
    const provider = new MockDataProvider('u1');
    await provider.addMembers('c2', ['u3']);
    expect((await provider.getConversationMembers('c2')).some(m => m.user_id === 'u3')).toBe(true);

    await provider.removeMember('c2', 'u3');
    expect((await provider.getConversationMembers('c2')).some(m => m.user_id === 'u3')).toBe(false);
  });
});

describe('MockDataProvider unread counters', () => {
  it('counts only messages from other people that come after the last read one', async () => {
    const provider = new MockDataProvider('u1');
    await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u4', content: 'первое' });
    const second = await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u4', content: 'второе' });
    await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u1', content: 'моё' });

    const before = (await provider.getConversations('u1')).find(c => c.id === 'c2');
    expect(before?.unread_count).toBe(2);

    await provider.markConversationAsRead('c2', 'u1', second.id);
    const after = (await provider.getConversations('u1')).find(c => c.id === 'c2');
    expect(after?.unread_count).toBe(0);

    await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u4', content: 'третье' });
    const later = (await provider.getConversations('u1')).find(c => c.id === 'c2');
    expect(later?.unread_count).toBe(1);
  });
});

describe('MockDataProvider message pagination', () => {
  it('returns the newest page first and older pages before a cursor', async () => {
    const provider = new MockDataProvider('u1');
    for (let i = 0; i < 7; i++) {
      await provider.sendMessage({ conversation_id: 'c3', sender_id: i % 2 ? 'u1' : 'u2', content: `msg ${i}` });
      await new Promise(r => setTimeout(r, 2));
    }

    const all = await provider.getMessages('c3');
    const newest = await provider.getMessages('c3', { limit: 3 });
    expect(newest.map(m => m.content)).toEqual(all.slice(-3).map(m => m.content));

    const older = await provider.getMessages('c3', { before: newest[0].created_at, limit: 3 });
    expect(older).toHaveLength(3);
    expect(older.every(m => new Date(m.created_at) < new Date(newest[0].created_at))).toBe(true);
    expect(older.map(m => m.content)).toEqual(all.slice(-6, -3).map(m => m.content));
  });
});

describe('MockDataProvider activity feed', () => {
  it('notifies activity subscribers about messages in any conversation', async () => {
    const provider = new MockDataProvider('u1');
    const seen: string[] = [];
    const unsubscribe = provider.subscribeToConversationActivity('u1', m => seen.push(m.conversation_id));

    await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u4', content: 'a' });
    await provider.sendMessage({ conversation_id: 'c5', sender_id: 'u2', content: 'b' });
    expect(seen).toEqual(['c2', 'c5']);

    unsubscribe();
    await provider.sendMessage({ conversation_id: 'c2', sender_id: 'u4', content: 'c' });
    expect(seen).toHaveLength(2);
  });

  it('reports the in-memory transport as online', () => {
    const provider = new MockDataProvider('u1');
    const states: string[] = [];
    provider.subscribeToConnectionState(s => states.push(s));
    expect(states).toEqual(['online']);
  });
});
