import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronBuilderCli = resolve(root, 'node_modules/electron-builder/out/cli/cli.js');
const env = { ...process.env };

const mirrorEnvKeys = [
  'NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR',
  'npm_config_electron_builder_binaries_mirror',
  'npm_package_config_electron_builder_binaries_mirror',
  'ELECTRON_BUILDER_BINARIES_MIRROR',
];

if (!mirrorEnvKeys.some((key) => env[key])) {
  env.ELECTRON_BUILDER_BINARIES_MIRROR =
    'https://npmmirror.com/mirrors/electron-builder-binaries/';
}

const result = spawnSync(
  process.execPath,
  [
    electronBuilderCli,
    '--win',
    '--publish',
    'never',
    '--config.electronDist=node_modules/electron/dist',
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
