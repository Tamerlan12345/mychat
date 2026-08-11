// scripts/seed-supabase.ts
// Run with: npm run seed:supabase
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const DEMO_USERS = [
  { email: 'admin@demo.local', password: 'password123', first_name: 'Администратор', last_name: 'Системный', role: 'SUPER_ADMIN', department: 'IT', position: 'CTO / Системный Администратор' },
  { email: 'employee1@demo.local', password: 'password123', first_name: 'Иван', last_name: 'Петров', role: 'EMPLOYEE', department: 'AI', position: 'Senior AI Engineer' },
  { email: 'employee2@demo.local', password: 'password123', first_name: 'Анна', last_name: 'Иванова', role: 'ADMIN', department: 'HR', position: 'HR Lead' },
  { email: 'employee3@demo.local', password: 'password123', first_name: 'Сергей', last_name: 'Смирнов', role: 'EMPLOYEE', department: 'IT', position: 'DevOps Specialist' },
];

const DEMO_DEPARTMENTS = [
  { name: 'IT', description: 'Департамент информационных технологий' },
  { name: 'AI', description: 'Лаборатория искусственного интеллекта' },
  { name: 'HR', description: 'Управление персоналом' },
  { name: 'Management', description: 'Руководство компании' },
];

async function main() {
  console.log('Seeding departments...');
  const deptIdByName = new Map<string, string>();
  for (const dept of DEMO_DEPARTMENTS) {
    const { data, error } = await supabase.from('departments').upsert(dept, { onConflict: 'name' }).select().single();
    if (error) throw error;
    deptIdByName.set(dept.name, data.id);
  }

  console.log('Seeding demo users via Supabase Auth...');
  for (const demoUser of DEMO_USERS) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: demoUser.email,
      password: demoUser.password,
      email_confirm: true,
      user_metadata: { first_name: demoUser.first_name, last_name: demoUser.last_name, role: demoUser.role },
    });
    if (error && !error.message.includes('already been registered')) throw error;
    if (!created?.user) {
      console.log(`  ${demoUser.email} already exists, skipping profile patch.`);
      continue;
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ position: demoUser.position, department_id: deptIdByName.get(demoUser.department), role: demoUser.role })
      .eq('id', created.user.id);
    if (profileError) throw profileError;
    console.log(`  created ${demoUser.email}`);
  }

  console.log('Seeding branding config...');
  const { error: brandingError } = await supabase
    .from('branding_config')
    .upsert({
      id: 1,
      company_name: 'Centras Chat',
      app_title: 'Corporate Messenger MVP',
      primary_color: '#2563eb',
      secondary_color: '#475569',
      background_color: '#0f172a',
    }, { onConflict: 'id' });
  if (brandingError) throw brandingError;

  console.log('Done. Log in with admin@demo.local / password123');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
