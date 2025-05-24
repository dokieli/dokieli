import { execSync } from 'child_process';

let failed = false;

try {
  execSync('TZ=UTC vitest run --coverage', { stdio: 'inherit' });
} catch {
  failed = true;
}

try {
  execSync('playwright test', { stdio: 'inherit' });
} catch {
  failed = true;
}

process.exit(failed ? 1 : 0);
