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
