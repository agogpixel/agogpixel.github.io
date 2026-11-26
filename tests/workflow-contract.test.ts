import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowContent } from '../scripts/gates/workflow-contract.ts';

test('workflow-contract: valid SHA-pinned CI workflow passes cleanly', () => {
  const validCiYaml = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: \${{ github.workflow == 'CI' }}
jobs:
  security:
    name: Security
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e
      - uses: zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd
  verify:
    name: Verify
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install chromium --only-shell
      - name: Run CI Orchestrator
        run: ./scripts/ci-local.ps1 -CI
  deploy:
    name: Deploy
    needs: [security, verify]
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346
  notify:
    name: Notify
    needs: [security, verify]
    if: always()
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
    env:
      WEBHOOK_URL: \${{ secrets.DISCORD_CI_WEBHOOK }}
    steps:
      - name: Dispatch card
        run: echo "Sending notification"
`;

  assert.deepEqual(validateWorkflowContent(validCiYaml, 'ci.yml'), []);
});

test('workflow-contract: rejects unpinned actions, root write perms, missing timeout, and unescaped expressions', () => {
  const badYaml = `
name: CI
permissions:
  contents: write
concurrency:
  group: fixed
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-24.04
    permissions:
      pages: write
    steps:
      - uses: actions/checkout@v4
      - name: Unsafe run
        run: echo "\${{ github.event.pull_request.title }}"
`;

  const errors = validateWorkflowContent(badYaml, 'ci.yml');
  assert.ok(errors.some((e) => e.includes('root permissions must specify \'contents: read\'')));
  assert.ok(errors.some((e) => e.includes('CI concurrency group must be caller-isolated')));
  assert.ok(errors.some((e) => e.includes('caller-isolated \'cancel-in-progress')));
  assert.ok(errors.some((e) => e.includes('must specify \'timeout-minutes\'')));
  assert.ok(errors.some((e) => e.includes('elevated write privilege \'pages: write\'')));
  assert.ok(errors.some((e) => e.includes('40-character commit SHA')));
  assert.ok(errors.some((e) => e.includes('with.persist-credentials: false')));
  assert.ok(errors.some((e) => e.includes('unescaped expression(s)')));
  assert.ok(errors.some((e) => e.includes('not in the exact step allowlist')));
  assert.ok(errors.some((e) => e.includes("dedicated 'security' job")));
  assert.ok(errors.some((e) => e.includes("dedicated 'notify' job")));
});
