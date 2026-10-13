// `node native/hook-helper/run.mjs build|test`: builds the hook helper (and runs its C++ tests) on Windows or macOS.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const win = process.platform === 'win32';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: here });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const action = process.argv[2];
if (action !== 'build' && action !== 'test') {
  console.error('usage: node native/hook-helper/run.mjs build|test');
  process.exit(2);
}
// npm launches scripts through `cmd /s` on Windows, which can confuse nested `for /F ('...')`
// calls inside Visual Studio's vcvars scripts on some machines. PowerShell starts this batch cleanly.
if (win) run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '& .\\build.cmd']);
else run('sh', ['build.sh']);
if (action === 'test') run(join(here, 'build', win ? 'helper_tests.exe' : 'helper_tests'), []);
