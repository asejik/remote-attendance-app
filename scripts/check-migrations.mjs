// Checks database migration files:
//  1. names look like `YYYYMMDDHHMMSS_snake_name.sql`;
//  2. each has a rollback in supabase/rollbacks/<name>.down.sql;
//  3. with BASE_SHA set (CI), files added since that commit sort AFTER every
//     migration that already existed there. Otherwise `db push` refuses them
//     (or applies them out of order) on databases that already have the later ones.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const problems = [];

for (const f of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(f)) problems.push(`${f}: name must be YYYYMMDDHHMMSS_snake_name.sql`);
  if (!existsSync(`supabase/rollbacks/${f.replace(/\.sql$/, '.down.sql')}`)) problems.push(`${f}: missing supabase/rollbacks/${f.replace(/\.sql$/, '.down.sql')}`);
}

const base = process.env.BASE_SHA;
if (base && !/^0+$/.test(base)) {
  let before = null;
  try {
    before = execFileSync('git', ['ls-tree', '--name-only', `${base}:${DIR}`], { encoding: 'utf8' })
      .split('\n').filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.log(`Base ${base} not available; skipping the order check.`);
  }
  if (before) {
    const latest = before.at(-1);
    for (const f of files.filter((f) => !before.includes(f))) {
      if (latest && f <= latest) problems.push(`${f}: new migration sorts before existing ${latest}; rename it with a later timestamp`);
    }
  }
}

if (problems.length) {
  console.error(`Migration check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Migration check passed (${files.length} migrations)`);
