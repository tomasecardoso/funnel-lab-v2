import { supabase } from './supabase.js';

/**
 * Scenario storage layer (Supabase-backed).
 *
 * Replaces the old window.storage shim. Each function takes either an authed
 * user (for owner CRUD) or works anonymously for public reads by slug.
 */

// Generate a URL-safe slug from a scenario name, with a short random suffix
// so collisions between two "Scenario 1"s don't clash.
export function generateSlug(name) {
  const base = (name || 'scenario')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'scenario'}-${suffix}`;
}

export async function listScenarios() {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, slug, nodes, edges, text_blocks, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbToScenario);
}

export async function createScenario({ name, nodes, edges, textBlocks }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('scenarios')
    .insert({
      owner_id: user.id,
      name: name || 'Untitled',
      nodes,
      edges,
      text_blocks: textBlocks || [],
    })
    .select()
    .single();

  if (error) throw error;
  return dbToScenario(data);
}

export async function updateScenario(id, patch) {
  // patch may include: name, nodes, edges, textBlocks, slug (null to unpublish)
  const dbPatch = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.nodes !== undefined) dbPatch.nodes = patch.nodes;
  if (patch.edges !== undefined) dbPatch.edges = patch.edges;
  if (patch.textBlocks !== undefined) dbPatch.text_blocks = patch.textBlocks;
  if (patch.slug !== undefined) dbPatch.slug = patch.slug;

  const { data, error } = await supabase
    .from('scenarios')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return dbToScenario(data);
}

export async function deleteScenario(id) {
  const { error } = await supabase.from('scenarios').delete().eq('id', id);
  if (error) throw error;
}

// Public read — no auth. RLS policy only exposes rows where slug IS NOT NULL.
export async function getScenarioBySlug(slug) {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, slug, nodes, edges, text_blocks, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data ? dbToScenario(data) : null;
}

export async function publishScenario(id, name) {
  const slug = generateSlug(name);
  return updateScenario(id, { slug });
}

export async function unpublishScenario(id) {
  return updateScenario(id, { slug: null });
}

// DB → app shape
function dbToScenario(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    nodes: row.nodes || [],
    edges: row.edges || [],
    textBlocks: row.text_blocks || [],
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}
