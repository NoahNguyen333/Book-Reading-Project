import { createAdminClient, createClient } from '@/lib/supabase/server';
import { Tenant, UserTenantMembership } from './types';
import { TenantRole } from '@/modules/entitlements';

/**
 * Creates a new family tenant record and establishes the creator as an 'admin'
 * in the tenant_members table.
 * Uses the service role admin client to bypass the initial bootstrap RLS boundary.
 */
export async function createTenantWithAdmin(
  userId: string,
  tenantName: string
): Promise<Tenant> {
  const adminClient = createAdminClient();

  // 1. Insert tenant
  const { data: tenantData, error: tenantError } = await adminClient
    .from('tenants')
    .insert({
      name: tenantName.trim(),
      plan_tier: 'free',
      limits: {},
    })
    .select('*')
    .single();

  if (tenantError || !tenantData) {
    throw new Error(`Failed to create tenant: ${tenantError?.message || 'Unknown error'}`);
  }

  // 2. Insert member as 'admin'
  const { error: memberError } = await adminClient
    .from('tenant_members')
    .insert({
      tenant_id: tenantData.id,
      user_id: userId,
      role: 'admin',
    });

  if (memberError) {
    // Attempt rollback of created tenant if member association fails
    await adminClient.from('tenants').delete().eq('id', tenantData.id);
    throw new Error(`Failed to assign tenant admin membership: ${memberError.message}`);
  }

  return {
    id: tenantData.id,
    name: tenantData.name,
    planTier: tenantData.plan_tier,
    limits: tenantData.limits,
    createdAt: tenantData.created_at,
  };
}

/**
 * Retrieves all tenants that the specified user belongs to, including their
 * assigned role within each tenant.
 */
export async function getUserTenants(userId: string): Promise<UserTenantMembership[]> {
  const supabase = await createClient();

  // Query tenant_members joined with tenants
  const { data, error } = await supabase
    .from('tenant_members')
    .select(`
      role,
      tenants (
        id,
        name,
        plan_tier,
        limits,
        created_at
      )
    `)
    .eq('user_id', userId);

  if (error || !data) {
    // If regular client fails (e.g. before initial session refresh), fallback to admin client
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('tenant_members')
      .select(`
        role,
        tenants (
          id,
          name,
          plan_tier,
          limits,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (adminError || !adminData) {
      return [];
    }

    return adminData
      .filter((row) => row.tenants !== null)
      .map((row) => {
        const t = row.tenants as unknown as {
          id: string;
          name: string;
          plan_tier: string;
          limits: Record<string, unknown>;
          created_at: string;
        };
        return {
          role: row.role as TenantRole,
          tenant: {
            id: t.id,
            name: t.name,
            planTier: t.plan_tier,
            limits: t.limits || {},
            createdAt: t.created_at,
          },
        };
      });
  }

  return data
    .filter((row) => row.tenants !== null)
    .map((row) => {
      const t = row.tenants as unknown as {
        id: string;
        name: string;
        plan_tier: string;
        limits: Record<string, unknown>;
        created_at: string;
      };
      return {
        role: row.role as TenantRole,
        tenant: {
          id: t.id,
          name: t.name,
          planTier: t.plan_tier,
          limits: t.limits || {},
          createdAt: t.created_at,
        },
      };
    });
}
