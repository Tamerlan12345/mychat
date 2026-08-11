import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
vi.mock('./supabase-client', () => ({
  getSupabaseClient: () => ({ from }),
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
