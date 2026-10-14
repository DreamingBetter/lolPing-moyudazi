import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The release workflow cannot run here, so these checks keep its ordering from regressing: installed apps read latest.yml from the
// newest *published* release, so the release has to stay a draft until the installer and update files are uploaded.
const workflow = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8').replace(/\r\n/g, '\n');

/** The text of one top-level job. */
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z]+:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

describe('release workflow', () => {
  it('creates the release as a draft, and only when none exists for the tag (a re-run keeps working)', () => {
    const create = job('release');
    expect(create).toMatch(/gh release create "\$GITHUB_REF_NAME"[^\n]*--draft/);
    expect(create).toMatch(/gh release list[^\n]*--json tagName/); // a draft is found by listing, not by `gh release view`
    expect(create).toMatch(/grep -Fx "\$GITHUB_REF_NAME" > \/dev\/null/); // not -q: grep reads the whole list, so gh never gets a broken pipe
  });

  it('uploads the Windows installer, latest.yml and the blockmap', () => {
    const win = job('windows');
    expect(win).toContain('"release/lolPing-moyudazi-Setup-${GITHUB_REF_NAME#v}.exe"');
    expect(win).toContain('"release/latest.yml"');
    expect(win).toContain('"release/lolPing-moyudazi-Setup-${GITHUB_REF_NAME#v}.exe.blockmap"');
    expect(win).toContain('--clobber');
    expect(workflow).not.toContain('\n  mac:\n');
    expect(workflow).not.toContain('dist:mac');
  });

  it('publishes the draft in a last job that waits for the Windows job', () => {
    const publish = job('publish');
    expect(publish).toMatch(/needs: windows/);
    expect(publish).toContain('gh release edit "$GITHUB_REF_NAME" --draft=false');
    expect(publish).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/); // no checkout in this job, so gh needs to be told the repository
  });

  it('leaves no git credentials behind in the Windows job (gh uses GH_TOKEN, and nothing there pushes)', () => {
    const text = job('windows');
    expect(text).toMatch(/actions\/checkout@v7\n\s+with:\n\s+persist-credentials: false/);
    expect(text).not.toMatch(/git (push|commit|tag)/);
    expect(text).toContain('GH_TOKEN: ${{ github.token }}');
  });

  it('never publishes from the Windows job', () => {
    expect(job('windows')).not.toContain('--draft=false');
  });
});
