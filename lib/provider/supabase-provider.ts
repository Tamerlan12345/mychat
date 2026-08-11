import { getSupabaseClient } from './supabase-client';
import { User, Department } from '@/types';

export function mapProfileRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url ?? undefined,
    phone: row.phone ?? undefined,
    position: row.position ?? undefined,
    department_id: row.department_id ?? undefined,
    department_name: row.departments?.name ?? undefined,
    status: row.status,
    role: row.role,
    last_seen: row.last_seen,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDepartmentRow(row: any): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    created_at: row.created_at,
    member_count: row.member_count,
  };
}

export class SupabaseDataProvider {
  private get client() {
    return getSupabaseClient();
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await this.client.from('profiles').select('*, departments(name)').order('first_name');
    if (error) throw new Error(`getUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getUserById failed: ${error.message}`);
    return data ? mapProfileRow(data) : null;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim();
    if (!q) return this.getUsers();
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,position.ilike.%${q}%`);
    if (error) throw new Error(`searchUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async createUser(userData: Partial<User>): Promise<User> {
    // Real signup happens via Supabase Auth (see docs/SUPABASE_SETUP.md and
    // scripts/seed-supabase.ts) — the handle_new_auth_user() trigger creates the
    // profiles row. This method covers admin edits to an existing profile's fields
    // that aren't part of signup (e.g. an admin pre-provisioning a department).
    throw new Error(
      'createUser: direct profile creation is not supported in Supabase mode — users are created via Supabase Auth signup, which auto-creates their profile.'
    );
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { department_name, ...rest } = updates;
    const { data, error } = await this.client
      .from('profiles')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(`updateUser failed: ${error.message}`);
    return mapProfileRow(data);
  }

  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.client.from('profiles').delete().eq('id', id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
    return true;
  }

  async setUserStatus(id: string, status: User['status']): Promise<User> {
    return this.updateUser(id, { status });
  }

  // --- DEPARTMENTS ---
  async getDepartments(): Promise<Department[]> {
    const { data, error } = await this.client.from('departments').select('*, profiles(count)');
    if (error) throw new Error(`getDepartments failed: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      ...mapDepartmentRow(row),
      member_count: row.profiles?.[0]?.count ?? 0,
    }));
  }

  async createDepartment(name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .insert({ name, description })
      .select()
      .single();
    if (error) throw new Error(`createDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .update({ name, description })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const { error } = await this.client.from('departments').delete().eq('id', id);
    if (error) throw new Error(`deleteDepartment failed: ${error.message}`);
    return true;
  }
}
