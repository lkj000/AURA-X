/**
 * Seed 10 launch producers. Calls POST /api/auth/register for each.
 * Usage: npx ts-node scripts/seed-producers.ts [API_BASE_URL]
 * Default API_BASE_URL: http://localhost:3003
 */

const BASE = process.argv[2] ?? process.env.API_BASE_URL ?? "http://localhost:3003";

const PRODUCERS = [
  { name: "DJ Lelo Zulu",        email: "lelo@aurax.launch",     country: "South Africa" },
  { name: "Boipelo Beats",       email: "boipelo@aurax.launch",  country: "South Africa" },
  { name: "Amara Nwachukwu",     email: "amara@aurax.launch",    country: "Nigeria" },
  { name: "Thandeka Mokoena",    email: "thandeka@aurax.launch", country: "South Africa" },
  { name: "Kwame Asante",        email: "kwame@aurax.launch",    country: "Ghana" },
  { name: "Siya Dlamini",        email: "siya@aurax.launch",     country: "South Africa" },
  { name: "Nkechi Eze",          email: "nkechi@aurax.launch",   country: "Nigeria" },
  { name: "Tshepo Maboya",       email: "tshepo@aurax.launch",   country: "South Africa" },
  { name: "Apio Akena",          email: "apio@aurax.launch",     country: "Uganda" },
  { name: "Farai Mutamba",       email: "farai@aurax.launch",    country: "Zimbabwe" },
];

const DEFAULT_PASSWORD = "AuraX2026!";

interface RegisterResult {
  artist_id: string;
  name: string;
  email: string;
  token: string;
}

async function registerProducer(producer: typeof PRODUCERS[0]): Promise<RegisterResult & { skipped?: boolean }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...producer, password: DEFAULT_PASSWORD }),
  });

  if (res.status === 409) {
    return { artist_id: "", name: producer.name, email: producer.email, token: "", skipped: true };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${producer.email}: ${(body as { error?: string }).error ?? res.statusText}`);
  }

  return res.json() as Promise<RegisterResult>;
}

async function main() {
  console.log(`Seeding ${PRODUCERS.length} producers → ${BASE}\n`);

  const results: Array<{ name: string; email: string; artist_id: string; token: string; status: string }> = [];

  for (const producer of PRODUCERS) {
    try {
      const result = await registerProducer(producer);
      if (result.skipped) {
        console.log(`  SKIP  ${producer.name} (${producer.email}) — already registered`);
        results.push({ ...producer, artist_id: "", token: "", status: "SKIPPED" });
      } else {
        console.log(`  OK    ${result.name} (${result.email}) — ${result.artist_id}`);
        results.push({ name: result.name, email: result.email, artist_id: result.artist_id, token: result.token, status: "CREATED" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  FAIL  ${producer.name} — ${msg}`);
      results.push({ ...producer, artist_id: "", token: "", status: `FAILED: ${msg}` });
    }
  }

  const created = results.filter((r) => r.status === "CREATED").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  const failed  = results.filter((r) => r.status.startsWith("FAILED")).length;

  console.log(`\n─── Summary ────────────────────────────────`);
  console.log(`Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);

  if (created > 0) {
    console.log(`\n─── Tokens ─────────────────────────────────`);
    results.filter((r) => r.status === "CREATED").forEach((r) => {
      console.log(`${r.email}\n  ${r.token}\n`);
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
