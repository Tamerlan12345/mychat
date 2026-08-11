import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const mockClient = { from };
vi.mock('./supabase-client', () => ({
  getSupabaseClient: () => mockClient,
}));

import { SupabaseDataProvider, mapProfileRow } from './supabase-provider';

describe('mapProfileRow', () => {
  it('maps a joined profile row to the User shape', () => {
    const row = {
      id: 'uuid-1',
      email: 'a@b.com',
      first_name: 'Иван',
      last_name: 'Петров',
      avatar_url: null,
      phone: '+7 999',
      position: 'Engineer',
      department_id: 'd1',
      departments: { name: 'AI' },
      status: 'ONLINE',
      role: 'EMPLOYEE',
      last_seen: '2026-08-10T00:00:00Z',
      created_at: '2026-08-10T00:00:00Z',
      updated_at: '2026-08-10T00:00:00Z',
    };
    const user = mapProfileRow(row);
    expect(user.id).toBe('uuid-1');
    expect(user.department_name).toBe('AI');
  });

  it('leaves department_name undefined when there is no joined department', () => {
    const row = {
      id: 'uuid-2', email: 'c@d.com', first_name: 'A', last_name: 'B',
      status: 'OFFLINE', role: 'EMPLOYEE', last_seen: '2026-08-10T00:00:00Z',
      created_at: '2026-08-10T00:00:00Z', updated_at: '2026-08-10T00:00:00Z',
      department_id: null, departments: null,
    };
    expect(mapProfileRow(row).department_name).toBeUndefined();
  });
});

describe('SupabaseDataProvider.getUsers', () => {
  beforeEach(() => from.mockReset());

  it('queries the profiles table with the department join, ordered by first name', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const provider = new SupabaseDataProvider();
    await provider.getUsers();

    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('*, departments(name)');
    expect(order).toHaveBeenCalledWith('first_name');
  });

  it('throws a descriptive error when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });

    const provider = new SupabaseDataProvider();
    await expect(provider.getUsers()).rejects.toThrow(/connection refused/);
  });
});

describe('mapMessageRow', () => {
  it('maps a message row with nested sender and reactions', async () => {
    const { mapMessageRow } = await import('./supabase-provider');
    const row = {
      id: 'm1', conversation_id: 'c1', sender_id: 'u1',
      profiles: { first_name: 'Иван', last_name: 'Петров', avatar_url: 'a.png' },
      content: 'Привет', message_type: 'TEXT', reply_to: null,
      edited_at: null, deleted_at: null, created_at: '2026-08-10T00:00:00Z',
      message_reactions: [{ id: 'r1', message_id: 'm1', user_id: 'u2', reaction: '👍', created_at: '2026-08-10T00:00:00Z', profiles: { first_name: 'A', last_name: 'B' } }],
      attachments: [],
    };
    const msg = mapMessageRow(row);
    expect(msg.sender_name).toBe('Иван Петров');
    expect(msg.reactions?.[0].reaction).toBe('👍');
  });
});

describe('SupabaseDataProvider.sendMessage', () => {
  beforeEach(() => from.mockReset());

  it('inserts into messages with the given fields and returns the mapped row', async () => {
    const insertedRow = {
      id: 'm2', conversation_id: 'c1', sender_id: 'u1',
      profiles: { first_name: 'Иван', last_name: 'Петров', avatar_url: null },
      content: 'Hello', message_type: 'TEXT', reply_to: undefined,
      edited_at: null, deleted_at: null, created_at: '2026-08-10T00:00:00Z',
      message_reactions: [], attachments: [],
    };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const provider = new SupabaseDataProvider();
    const result = await provider.sendMessage({ conversation_id: 'c1', sender_id: 'u1', content: 'Hello' });

    expect(from).toHaveBeenCalledWith('messages');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c1', sender_id: 'u1', content: 'Hello', message_type: 'TEXT' })
    );
    expect(result.id).toBe('m2');
  });
});

describe('SupabaseDataProvider.updateBranding', () => {
  beforeEach(() => from.mockReset());

  it('updates the single branding_config row (id = 1) and broadcasts the change', async () => {
    const updatedRow = { id: 1, company_name: 'New Co', app_title: 'X', logo_url: '', logo_small_url: '',
      favicon_url: '', primary_color: '#000', secondary_color: '#111', background_color: '#222',
      login_background: '', updated_at: '2026-08-10T00:00:00Z' };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const send = vi.fn().mockResolvedValue(undefined);
    const channel = { send, subscribe: vi.fn().mockReturnThis() };
    const channelFn = vi.fn().mockReturnValue(channel);

    const provider = new SupabaseDataProvider();
    (provider as any).client.channel = channelFn;

    const result = await provider.updateBranding({ company_name: 'New Co' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'New Co' }));
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(result.company_name).toBe('New Co');
  });
});
