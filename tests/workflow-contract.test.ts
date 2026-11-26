import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  runWorkflowContractGate,
  validateWorkflowContent,
} from '../scripts/gates/workflow-contract.ts';

test('workflow-contract: live .github/workflows passes all checks', () => {
  const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
  const entries = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.deepEqual(entries, ['ci.yml']);

  const result = runWorkflowContractGate(workflowsDir);
  assert.equal(
    result.ok,
    true,
    `Workflow contract gate failed on live files:\n${result.errors.join('\n')}`
  );
  assert.equal(result.errors.length, 0);
});

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
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}
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
    needs: [security, verify, deploy]
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
  assert.ok(errors.some((e) => e.includes('PR-only cancellation \'cancel-in-progress')));
  assert.ok(errors.some((e) => e.includes('must specify \'timeout-minutes\'')));
  assert.ok(errors.some((e) => e.includes('elevated write privilege \'pages: write\'')));
  assert.ok(errors.some((e) => e.includes('40-character commit SHA')));
  assert.ok(errors.some((e) => e.includes('with.persist-credentials: false')));
  assert.ok(errors.some((e) => e.includes('unescaped expression(s)')));
  assert.ok(errors.some((e) => e.includes('not in the exact step allowlist')));
  assert.ok(errors.some((e) => e.includes("dedicated 'security' job")));
  assert.ok(errors.some((e) => e.includes("dedicated 'notify' job")));
});

test('workflow-contract: rejects invalid job permissions types and notify omitting deploy', () => {
  const invalidJobPermsAndNotifyYaml = `
name: CI
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}
jobs:
  security:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions: []
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Run CI Orchestrator
        run: ./scripts/ci-local.ps1 -CI
  deploy:
    needs: [security, verify]
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions: "bogus"
    steps:
      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346
  notify:
    needs: [security, verify]
    if: always()
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions: 123
    env:
      WEBHOOK_URL: \${{ secrets.DISCORD_CI_WEBHOOK }}
    steps:
      - name: Dispatch card
        run: echo "Sending notification"
`;

  const errors = validateWorkflowContent(invalidJobPermsAndNotifyYaml, 'ci.yml');
  assert.ok(errors.some((e) => e.includes("job 'security' permissions must be a mapping")));
  assert.ok(errors.some((e) => e.includes("job 'deploy' specifies invalid permissions string 'bogus'")));
  assert.ok(errors.some((e) => e.includes("job 'notify' permissions must be a mapping")));
  assert.ok(errors.some((e) => e.includes("'notify' job must declare 'needs: [security, verify, deploy]'")));
});

test('workflow-contract: requires zizmorcore/zizmor-action in security job without requiring gitleaks', () => {
  const securityWithoutZizmorYaml = `
name: CI
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}
jobs:
  security:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Run CI Orchestrator
        run: ./scripts/ci-local.ps1 -CI
  notify:
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

  const nonPrCancelYaml = securityWithoutZizmorYaml.replace(
    "github.event_name == 'pull_request'",
    "github.workflow == 'CI'"
  );
  assert.ok(
    validateWorkflowContent(nonPrCancelYaml, 'ci.yml').some((e) =>
      e.includes('PR-only cancellation')
    )
  );

  const errors = validateWorkflowContent(securityWithoutZizmorYaml, 'ci.yml');
  assert.deepEqual(errors, [
    "ci.yml: 'security' job must include a step running 'zizmorcore/zizmor-action'.",
  ]);
});
