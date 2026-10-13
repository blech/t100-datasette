export function queryUrl(name, params = {}) {
  const q = new URLSearchParams({ _shape: 'objects' });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return `/t100/${name}.json?${q}`;
}

export async function fetchRows(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  const body = await res.json();
  return { rows: body.rows || [], truncated: Boolean(body.truncated) };
}
