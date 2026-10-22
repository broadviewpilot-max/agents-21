import { getStore } from '@netlify/blobs';

const s = (name: string) => getStore({ name, consistency: 'strong' });

export async function getJson<T>(store: string, key: string): Promise<T | null> {
  return (await s(store).get(key, { type: 'json' })) as T | null;
}
export async function putJson(store: string, key: string, value: unknown): Promise<void> {
  await s(store).setJSON(key, value);
}
export async function delKey(store: string, key: string): Promise<void> {
  await s(store).delete(key);
}
export async function listJson<T>(store: string): Promise<T[]> {
  const { blobs } = await s(store).list();
  const rows = await Promise.all(blobs.map((b) => s(store).get(b.key, { type: 'json' }) as Promise<unknown>));
  return rows.filter((r) => r !== null && r !== undefined) as T[];
}
