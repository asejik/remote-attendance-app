// The repository (and so every Actions log) is public. Any workflow that takes
// manual inputs must hide them with the "Hide inputs in the public log" step,
// and that step must come first, before anything can print the values.
import { readdirSync, readFileSync } from 'node:fs';

const DIR = '.github/workflows';
const problems = [];
for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
  const text = readFileSync(`${DIR}/${file}`, 'utf8');
  if (!/workflow_dispatch:\s*\n\s+inputs:/.test(text)) continue;
  const steps = text.split(/\n\s+steps:\n/)[1] ?? '';
  const maskAt = steps.indexOf('::add-mask::');
  const firstOther = steps.search(/- (uses|name): (?!Hide inputs in the public log)/);
  if (maskAt === -1) problems.push(`${file}: takes inputs but never hides them (add the "Hide inputs in the public log" step first)`);
  else if (firstOther !== -1 && firstOther < steps.indexOf('Hide inputs in the public log')) problems.push(`${file}: the "Hide inputs" step must be the first step`);
}
if (problems.length) {
  console.error(`Workflow check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Workflow check passed');
