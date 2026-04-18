#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { minimatch } from 'minimatch';
import YAML from 'yaml';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type GovernanceMode = 'institutional';
type RiskBudget = 'zero' | 'low' | 'very_low' | 'minimal' | 'moderate';
type ChangeType = 'ui-only' | 'ai-tuning' | 'additive-backend' | 'contract-breaking' | 'stage-transition';

interface CliArgs {
  base?: string;
  head?: string;
  headRef?: string;
  labels?: string[];
  agent?: string;
}

interface PullRequestEvent {
  pull_request?: {
    base?: { sha?: string; ref?: string };
    head?: { sha?: string; ref?: string };
    labels?: Array<{ name?: string }>;
  };
}

interface OwnershipLock {
  id: string;
  path_glob: string;
  owner: string;
  reviewers?: string[];
  precedence?: number;
}

interface OwnershipConfig {
  version: number;
  resolution?: {
    algorithm?: string;
    deny_on_unowned_write?: boolean;
    require_owner_agent_for_cross_domain?: boolean;
  };
  locks: OwnershipLock[];
}

interface StageGateCheck {
  name: string;
  command: string;
}

interface StageGate {
  phase: number;
  gate_id: string;
  risk_budget: RiskBudget;
  objective: string;
  checks: StageGateCheck[];
  thresholds: Array<{ metric: string; op: string; value: string | number }>;
  approvers: string[];
  block_on_failure: boolean;
}

interface GateDecision {
  phase: number;
  status: string;
  approver: string;
  timestamp: string;
  evidence_refs: string[];
  exceptions?: string[];
}

interface StageGateProgress {
  current_phase: number;
  completed_phases: number[];
  decisions: GateDecision[];
}

interface StagePhaseProfile {
  id: number;
  name: string;
  risk_budget: RiskBudget;
  allowed_change_types: ChangeType[];
  blocked_paths: string[];
  requires_orchestrator_for_transition: boolean;
}

interface StageGatesConfig {
  version: number;
  mode: GovernanceMode;
  policy: string;
  risk_model: string;
  phases: StagePhaseProfile[];
  progress?: StageGateProgress;
  stage_gates: StageGate[];
}

interface ContractSpec {
  contract_id: string;
  source_paths: string[];
  change_policy: string;
  required_signoffs: string[];
}

interface ContractsConfig {
  version: number;
  contracts: ContractSpec[];
}

interface AgentSpec {
  id: string;
  role: string;
  owned_paths: string[];
  skills: string[];
  forbidden_actions: string[];
  required_approvals: string[];
}

interface AgentRegistry {
  version: number;
  agents: AgentSpec[];
}

interface Violation {
  code: string;
  message: string;
  file?: string;
  details?: Json;
}

interface GovernanceResult {
  ok: boolean;
  base: string;
  head: string;
  headRef: string;
  actingAgent: string | null;
  labels: string[];
  changeType: ChangeType | null;
  changedFiles: string[];
  violations: Violation[];
}

interface ChangeTypeParseResult {
  changeType: ChangeType | null;
  parseErrors: Violation[];
}

const ORCHESTRATOR_LABEL = 'orchestrator-approved';
const ARCHITECTURE_LABEL = 'architecture-approved';
const SECURITY_LABEL = 'security-approved';
const CONTRACT_VERSION_FILE = '.codex/multi-agent/contract-version.txt';
const STAGE_GATES_FILE = '.codex/multi-agent/stage-gates.yaml';
const CHANGE_TYPE_PREFIX = 'change_type:';
const SQITCH_VERIFIED_LABEL = 'sqitch-verified';
const CHANGE_TYPE_VALUES = new Set<ChangeType>([
  'ui-only',
  'ai-tuning',
  'additive-backend',
  'contract-breaking',
  'stage-transition',
]);
const GOVERNANCE_SELF_PROTECTED_FILES = new Set([
  '.github/workflows/governance.yml',
  'scripts/governance-check.ts',
]);

const ADDITIVE_BACKEND_ALLOWED_GLOBS = [
  'apps/api/**',
  'jobs/worker/**',
  'sql/**',
  'docs/**',
  '.codex/artifacts/**',
];

const AI_TUNING_ALLOWED_GLOBS = ['apps/ai/**', 'docs/**', '.codex/artifacts/**'];
const UI_ONLY_ALLOWED_GLOBS = ['apps/web/**', 'docs/**', '.codex/artifacts/**'];

function runGit(command: string): string {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--base' && next) {
      args.base = next;
      i += 1;
      continue;
    }
    if (token === '--head' && next) {
      args.head = next;
      i += 1;
      continue;
    }
    if (token === '--head-ref' && next) {
      args.headRef = next;
      i += 1;
      continue;
    }
    if (token === '--labels' && next) {
      args.labels = next
        .split(',')
        .map((label) => label.trim())
        .filter((label) => label.length > 0);
      i += 1;
      continue;
    }
    if (token === '--agent' && next) {
      args.agent = next;
      i += 1;
      continue;
    }
  }
  return args;
}

function loadEvent(): PullRequestEvent {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return {};
  const content = fs.readFileSync(eventPath, 'utf8');
  try {
    return JSON.parse(content) as PullRequestEvent;
  } catch {
    return {};
  }
}

function resolveDefaultBase(): string {
  try {
    return runGit('git rev-parse HEAD~1');
  } catch {
    return 'HEAD';
  }
}

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

function getChangedFiles(base: string, head: string): string[] {
  const diff = runGit(`git diff --name-status --find-renames ${base}...${head}`);
  const files = new Set<string>();
  if (!diff) return [];

  for (const line of diff.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const status = parts[0];
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath) files.add(normalizePath(oldPath));
      if (newPath) files.add(normalizePath(newPath));
      continue;
    }

    const filePath = parts[1];
    if (filePath) files.add(normalizePath(filePath));
  }

  return Array.from(files).sort();
}

function readYamlFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(content) as T;
}

function readGitFile(rev: string, filePath: string): string | null {
  try {
    return runGit(`git show ${rev}:${filePath}`);
  } catch {
    return null;
  }
}

function parseSemver(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isSemverBump(oldVersion: string, newVersion: string): boolean {
  const oldParsed = parseSemver(oldVersion);
  const newParsed = parseSemver(newVersion);
  if (!oldParsed || !newParsed) return false;

  for (let i = 0; i < 3; i += 1) {
    if (newParsed[i] > oldParsed[i]) return true;
    if (newParsed[i] < oldParsed[i]) return false;
  }
  return false;
}

function detectActingAgent(headRef: string, labels: string[], explicitAgent?: string): string | null {
  if (explicitAgent && explicitAgent.trim().length > 0) return explicitAgent.trim();

  const branchMatch = headRef.match(/^agent\/([^/]+)\//);
  if (branchMatch?.[1]) return branchMatch[1];

  const label = labels.find((item) => item.startsWith('agent:'));
  if (label) return label.slice('agent:'.length).trim() || null;

  return null;
}

function globSpecificity(globPattern: string): number {
  return globPattern.replace(/[*?{}()[\]!+@]/g, '').length;
}

function findBestLock(filePath: string, locks: OwnershipLock[]): OwnershipLock | null {
  const matches = locks.filter((lock) => minimatch(filePath, lock.path_glob, { dot: true }));
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const specificityDiff = globSpecificity(b.path_glob) - globSpecificity(a.path_glob);
    if (specificityDiff !== 0) return specificityDiff;
    const aPrecedence = a.precedence ?? 0;
    const bPrecedence = b.precedence ?? 0;
    return bPrecedence - aPrecedence;
  });

  return matches[0];
}

function hasAnyLabel(labels: string[], expected: string[]): boolean {
  return expected.some((label) => labels.includes(label));
}

function hasAllLabels(labels: string[], required: string[]): boolean {
  return required.every((label) => labels.includes(label));
}

function isContractProtectedPath(filePath: string): boolean {
  const protectedGlobs = [
    'apps/api/src/graphql/schema.gql.ts',
    'sql/**/*.sql',
    'sql/sqitch.plan',
    '.codex/multi-agent/contracts.yaml',
  ];
  return protectedGlobs.some((glob) => minimatch(filePath, glob, { dot: true }));
}

function parsePhaseFromHeadRef(headRef: string): number | null {
  const match = headRef.match(/phase-(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

function pathMatchesAny(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => minimatch(filePath, glob, { dot: true }));
}

function enforceModeAndSchema(stageConfig: StageGatesConfig, violations: Violation[]): void {
  if (stageConfig.mode !== 'institutional') {
    violations.push({
      code: 'mode_invalid',
      message: `Expected governance mode 'institutional', found '${String(stageConfig.mode)}'`,
      file: STAGE_GATES_FILE,
    });
  }

  if (stageConfig.risk_model !== 'hard_outer_gates_fast_inner_loops') {
    violations.push({
      code: 'risk_model_invalid',
      message: "risk_model must be 'hard_outer_gates_fast_inner_loops'",
      file: STAGE_GATES_FILE,
    });
  }

  if (!Array.isArray(stageConfig.phases) || stageConfig.phases.length === 0) {
    violations.push({
      code: 'phase_profiles_missing',
      message: 'stage-gates.yaml must define phases metadata for institutional mode',
      file: STAGE_GATES_FILE,
    });
    return;
  }

  const phaseIds = stageConfig.phases.map((profile) => profile.id).sort((a, b) => a - b);
  for (let i = 0; i < phaseIds.length; i += 1) {
    if (phaseIds[i] !== i + 1) {
      violations.push({
        code: 'phase_profiles_non_contiguous',
        message: 'phases ids must be contiguous starting from 1',
        file: STAGE_GATES_FILE,
        details: { phase_ids: phaseIds },
      });
      break;
    }
  }

  for (const gate of stageConfig.stage_gates) {
    const profile = stageConfig.phases.find((candidate) => candidate.id === gate.phase);
    if (!profile) {
      violations.push({
        code: 'stage_gate_profile_missing',
        message: `Missing phase profile for gate phase ${gate.phase}`,
        file: STAGE_GATES_FILE,
      });
      continue;
    }

    if (gate.risk_budget !== profile.risk_budget) {
      violations.push({
        code: 'stage_gate_risk_budget_mismatch',
        message: `Gate risk_budget for phase ${gate.phase} must match phase profile`,
        file: STAGE_GATES_FILE,
        details: {
          gate_risk_budget: gate.risk_budget,
          phase_risk_budget: profile.risk_budget,
        },
      });
    }
  }
}

function parseChangeType(labels: string[], changedFiles: string[]): ChangeTypeParseResult {
  if (changedFiles.length === 0) {
    return { changeType: null, parseErrors: [] };
  }

  const matches = labels.filter((label) => label.startsWith(CHANGE_TYPE_PREFIX));
  if (matches.length === 0) {
    return {
      changeType: null,
      parseErrors: [
        {
          code: 'change_type_missing',
          message: 'Governed PRs must include exactly one change_type:<value> label',
        },
      ],
    };
  }

  if (matches.length > 1) {
    return {
      changeType: null,
      parseErrors: [
        {
          code: 'change_type_multiple',
          message: 'Only one change_type label is allowed per PR',
          details: { labels: matches },
        },
      ],
    };
  }

  const value = matches[0].slice(CHANGE_TYPE_PREFIX.length).trim() as ChangeType;
  if (!CHANGE_TYPE_VALUES.has(value)) {
    return {
      changeType: null,
      parseErrors: [
        {
          code: 'change_type_invalid',
          message: `Unsupported change_type '${value}'`,
          details: { allowed: Array.from(CHANGE_TYPE_VALUES) },
        },
      ],
    };
  }

  return { changeType: value, parseErrors: [] };
}

function validateStageProgress(stageConfig: StageGatesConfig, violations: Violation[]): void {
  const phases = stageConfig.stage_gates.map((gate) => gate.phase).sort((a, b) => a - b);

  for (let i = 0; i < phases.length; i += 1) {
    if (phases[i] !== i + 1) {
      violations.push({
        code: 'stage_phases_non_contiguous',
        message: 'stage_gates phases must be contiguous starting at 1',
        details: { phases },
      });
      break;
    }
  }

  const progress = stageConfig.progress;
  if (!progress) {
    violations.push({
      code: 'stage_progress_missing',
      message: 'stage-gates.yaml must define a progress block',
      file: STAGE_GATES_FILE,
    });
    return;
  }

  const completed = [...progress.completed_phases].sort((a, b) => a - b);
  const uniqueCompleted = Array.from(new Set(completed));
  if (uniqueCompleted.length !== completed.length) {
    violations.push({
      code: 'stage_completed_duplicates',
      message: 'completed_phases must not contain duplicates',
      file: STAGE_GATES_FILE,
      details: { completed_phases: progress.completed_phases },
    });
  }

  for (let i = 0; i < uniqueCompleted.length; i += 1) {
    if (uniqueCompleted[i] !== i + 1) {
      violations.push({
        code: 'stage_completed_non_contiguous',
        message: 'completed_phases must be contiguous from phase 1',
        file: STAGE_GATES_FILE,
        details: { completed_phases: uniqueCompleted },
      });
      break;
    }
  }

  const maxPhase = phases.length;
  for (const phase of uniqueCompleted) {
    if (phase < 1 || phase > maxPhase) {
      violations.push({
        code: 'stage_completed_out_of_range',
        message: `completed phase ${phase} is out of configured range`,
        file: STAGE_GATES_FILE,
      });
    }
  }

  const expectedCurrent = uniqueCompleted.length >= maxPhase ? maxPhase : uniqueCompleted.length + 1;
  if (progress.current_phase !== expectedCurrent) {
    violations.push({
      code: 'stage_current_phase_invalid',
      message: 'current_phase must equal completed_phases + 1 (or max phase when fully complete)',
      file: STAGE_GATES_FILE,
      details: {
        current_phase: progress.current_phase,
        expected_current_phase: expectedCurrent,
      },
    });
  }

  for (const phase of uniqueCompleted) {
    const approved = progress.decisions.some((decision) =>
      decision.phase === phase && decision.status === 'APPROVE' && decision.approver === 'orchestrator'
    );
    if (!approved) {
      violations.push({
        code: 'stage_decision_missing',
        message: `completed phase ${phase} requires an APPROVE decision by orchestrator`,
        file: STAGE_GATES_FILE,
      });
    }

    const decisionArtifact = path.join('.codex/artifacts/gate-decisions', `phase-${phase}.json`);
    if (!fs.existsSync(decisionArtifact)) {
      violations.push({
        code: 'stage_decision_artifact_missing',
        message: `completed phase ${phase} requires ${decisionArtifact}`,
        file: decisionArtifact,
      });
      continue;
    }

    try {
      const artifact = JSON.parse(fs.readFileSync(decisionArtifact, 'utf8')) as {
        status?: string;
        phase?: number;
        approver?: string;
        check_results?: Array<{ name?: string; status?: string }>;
      };
      if (artifact.status !== 'APPROVE' || artifact.phase !== phase || artifact.approver !== 'orchestrator') {
        violations.push({
          code: 'stage_decision_artifact_invalid',
          message: `${decisionArtifact} must contain orchestrator APPROVE for phase ${phase}`,
          file: decisionArtifact,
        });
      } else {
        const gate = stageConfig.stage_gates.find((item) => item.phase === phase);
        if (!gate) {
          violations.push({
            code: 'stage_gate_definition_missing',
            message: `No stage gate definition found for completed phase ${phase}`,
            file: STAGE_GATES_FILE,
          });
        } else {
          const checkResults = artifact.check_results ?? [];
          for (const requiredCheck of gate.checks) {
            const result = checkResults.find((item) => item.name === requiredCheck.name);
            if (!result || result.status !== 'pass') {
              violations.push({
                code: 'stage_gate_check_result_missing_or_failed',
                message: `Decision artifact for phase ${phase} must mark '${requiredCheck.name}' as pass`,
                file: decisionArtifact,
              });
            }
          }
        }
      }
    } catch {
      violations.push({
        code: 'stage_decision_artifact_parse_error',
        message: `failed to parse decision artifact ${decisionArtifact}`,
        file: decisionArtifact,
      });
    }
  }
}

function isOutOfBudget(
  changeType: ChangeType | null,
  activePhase: StagePhaseProfile | undefined,
  changedFiles: string[],
): { outOfBudget: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (changedFiles.length === 0) {
    return { outOfBudget: false, reasons };
  }

  if (!activePhase) {
    reasons.push('active_phase_missing_profile');
    return { outOfBudget: true, reasons };
  }

  if (!changeType) {
    reasons.push('change_type_missing');
    return { outOfBudget: true, reasons };
  }

  if (!activePhase.allowed_change_types.includes(changeType)) {
    reasons.push('change_type_not_allowed_for_phase');
  }

  if (activePhase.blocked_paths.length > 0) {
    for (const filePath of changedFiles) {
      if (pathMatchesAny(filePath, activePhase.blocked_paths)) {
        reasons.push(`blocked_path:${filePath}`);
      }
    }
  }

  return { outOfBudget: reasons.length > 0, reasons };
}

function enforceChangeTypePolicy(
  changeType: ChangeType | null,
  changedFiles: string[],
  protectedContractChanges: string[],
  stageGatesChanged: boolean,
  labels: string[],
  violations: Violation[],
): void {
  if (!changeType) return;

  if (changeType === 'ui-only') {
    const invalid = changedFiles.filter((filePath) => !pathMatchesAny(filePath, UI_ONLY_ALLOWED_GLOBS));
    if (invalid.length > 0) {
      violations.push({
        code: 'change_type_ui_scope_violation',
        message: 'ui-only change_type can only modify apps/web/** (plus docs/artifacts)',
        details: { files: invalid },
      });
    }

    if (protectedContractChanges.length > 0 || stageGatesChanged) {
      violations.push({
        code: 'change_type_ui_protected_violation',
        message: 'ui-only change_type cannot modify protected contract or stage transition files',
      });
    }
  }

  if (changeType === 'ai-tuning') {
    const invalid = changedFiles.filter((filePath) => !pathMatchesAny(filePath, AI_TUNING_ALLOWED_GLOBS));
    if (invalid.length > 0) {
      violations.push({
        code: 'change_type_ai_scope_violation',
        message: 'ai-tuning change_type can only modify apps/ai/** (plus docs/artifacts)',
        details: { files: invalid },
      });
    }

    if (changedFiles.some((filePath) => minimatch(filePath, 'sql/**', { dot: true }))) {
      violations.push({
        code: 'change_type_ai_sql_violation',
        message: 'ai-tuning cannot modify SQL paths',
      });
    }

    if (changedFiles.some((filePath) => minimatch(filePath, '.codex/multi-agent/**', { dot: true }))) {
      violations.push({
        code: 'change_type_ai_governance_violation',
        message: 'ai-tuning cannot modify governance control-plane artifacts',
      });
    }
  }

  if (changeType === 'additive-backend') {
    const invalid = changedFiles.filter((filePath) => !pathMatchesAny(filePath, ADDITIVE_BACKEND_ALLOWED_GLOBS));
    if (invalid.length > 0) {
      violations.push({
        code: 'change_type_backend_scope_violation',
        message: 'additive-backend change_type is limited to backend/worker/sql/docs/artifact paths',
        details: { files: invalid },
      });
    }

    const sqlTouched = changedFiles.some((filePath) => minimatch(filePath, 'sql/**', { dot: true }));
    if (sqlTouched && !labels.includes(SQITCH_VERIFIED_LABEL)) {
      violations.push({
        code: 'additive_backend_sqitch_verify_missing',
        message: `additive-backend changes touching SQL require '${SQITCH_VERIFIED_LABEL}' label`,
      });
    }
  }

  if (changeType === 'contract-breaking') {
    if (protectedContractChanges.length === 0) {
      violations.push({
        code: 'contract_breaking_no_contract_change',
        message: 'contract-breaking change_type requires touching protected contract files',
      });
    }
    if (!labels.includes(ORCHESTRATOR_LABEL)) {
      violations.push({
        code: 'contract_breaking_orchestrator_missing',
        message: `contract-breaking change_type requires '${ORCHESTRATOR_LABEL}' label`,
      });
    }
  }

  if (changeType === 'stage-transition') {
    if (!stageGatesChanged) {
      violations.push({
        code: 'stage_transition_missing_stage_file',
        message: 'stage-transition change_type requires modifying stage-gates.yaml',
        file: STAGE_GATES_FILE,
      });
    }
    if (!labels.includes(ORCHESTRATOR_LABEL)) {
      violations.push({
        code: 'stage_transition_orchestrator_missing',
        message: `stage-transition change_type requires '${ORCHESTRATOR_LABEL}' label`,
      });
    }

    const decisionArtifactsChanged = changedFiles.some((filePath) =>
      minimatch(filePath, '.codex/artifacts/gate-decisions/phase-*.json', { dot: true }),
    );
    if (!decisionArtifactsChanged) {
      violations.push({
        code: 'stage_transition_decision_artifact_missing',
        message: 'stage-transition requires a gate decision artifact update in the same PR',
      });
    }
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const event = loadEvent();
  const inCi = process.env.GITHUB_ACTIONS === 'true';

  const base = args.base ?? event.pull_request?.base?.sha ?? resolveDefaultBase();
  const head = args.head ?? event.pull_request?.head?.sha ?? 'HEAD';
  const headRef = args.headRef ?? event.pull_request?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? '';

  const eventLabels = event.pull_request?.labels?.map((label) => label.name ?? '').filter(Boolean) ?? [];
  const labels = inCi
    ? eventLabels
    : args.labels ?? eventLabels;

  const actingAgent = detectActingAgent(headRef, labels, args.agent);
  const changedFiles = getChangedFiles(base, head);

  const ownership = readYamlFile<OwnershipConfig>('.codex/multi-agent/ownership-locks.yaml');
  const contracts = readYamlFile<ContractsConfig>('.codex/multi-agent/contracts.yaml');
  const stageGates = readYamlFile<StageGatesConfig>(STAGE_GATES_FILE);
  const agentRegistry = readYamlFile<AgentRegistry>('.codex/multi-agent/agent-registry.yaml');

  const violations: Violation[] = [];

  enforceModeAndSchema(stageGates, violations);

  const currentPhase = stageGates.progress?.current_phase ?? 1;
  const activePhase = stageGates.phases.find((phase) => phase.id === currentPhase);
  if (!activePhase) {
    violations.push({
      code: 'active_phase_profile_missing',
      message: `Missing phase profile for current_phase ${currentPhase}`,
      file: STAGE_GATES_FILE,
    });
  }

  const { changeType, parseErrors } = parseChangeType(labels, changedFiles);
  violations.push(...parseErrors);

  if (!actingAgent) {
    violations.push({
      code: 'agent_identity_missing',
      message: 'Unable to determine acting agent. Use branch format agent/<id>/... or label agent:<id>.',
    });
  } else {
    const knownAgent = agentRegistry.agents.some((agent) => agent.id === actingAgent);
    if (!knownAgent) {
      violations.push({
        code: 'agent_unknown',
        message: `Acting agent '${actingAgent}' is not defined in agent-registry.yaml`,
      });
    }
  }

  for (const filePath of changedFiles) {
    const lock = findBestLock(filePath, ownership.locks);
    if (!lock) {
      violations.push({
        code: 'ownership_unmapped_path',
        message: 'No ownership lock matched changed file',
        file: filePath,
      });
      continue;
    }

    if (actingAgent && lock.owner !== actingAgent) {
      violations.push({
        code: 'ownership_violation',
        message: `Changed file is owned by '${lock.owner}', not acting agent '${actingAgent}'`,
        file: filePath,
        details: { lock_id: lock.id, lock_glob: lock.path_glob, owner: lock.owner },
      });
    }
  }

  const protectedContractChanges = changedFiles.filter((filePath) => isContractProtectedPath(filePath));
  if (protectedContractChanges.length > 0) {
    if (!labels.includes(ORCHESTRATOR_LABEL)) {
      violations.push({
        code: 'contract_orchestrator_label_missing',
        message: `Protected contract changes require '${ORCHESTRATOR_LABEL}' label`,
        details: { files: protectedContractChanges },
      });
    }

    if (!changedFiles.includes(CONTRACT_VERSION_FILE)) {
      violations.push({
        code: 'contract_version_bump_missing',
        message: `Protected contract changes require ${CONTRACT_VERSION_FILE} to be updated`,
      });
    } else {
      const oldVersionRaw = readGitFile(base, CONTRACT_VERSION_FILE) ?? '0.0.0';
      const newVersionRaw = readGitFile(head, CONTRACT_VERSION_FILE) ?? fs.readFileSync(CONTRACT_VERSION_FILE, 'utf8');
      if (!isSemverBump(oldVersionRaw, newVersionRaw)) {
        violations.push({
          code: 'contract_version_not_incremented',
          message: 'Contract version must be incremented when protected contracts change',
          file: CONTRACT_VERSION_FILE,
          details: {
            old: oldVersionRaw.trim(),
            next: newVersionRaw.trim(),
          },
        });
      }
    }
  }

  const changedContractsYaml = changedFiles.includes('.codex/multi-agent/contracts.yaml');
  if (changedContractsYaml && actingAgent !== 'orchestrator') {
    violations.push({
      code: 'contracts_yaml_owner_violation',
      message: 'contracts.yaml can only be modified by orchestrator agent',
      file: '.codex/multi-agent/contracts.yaml',
    });
  }

  const skillChanged = changedFiles.some((filePath) => minimatch(filePath, '.codex/skills/**/SKILL.md', { dot: true }));
  if (skillChanged) {
    if (!labels.includes(ORCHESTRATOR_LABEL)) {
      violations.push({
        code: 'skills_orchestrator_label_missing',
        message: `Skill definition changes require '${ORCHESTRATOR_LABEL}' label`,
      });
    }
    if (!labels.includes(SECURITY_LABEL)) {
      violations.push({
        code: 'skills_security_label_missing',
        message: `Skill definition changes require '${SECURITY_LABEL}' label`,
      });
    }
    if (actingAgent !== 'orchestrator') {
      violations.push({
        code: 'skills_owner_violation',
        message: 'Skill definition changes can only be authored by orchestrator agent',
      });
    }
  }

  const agentsFilesChanged = changedFiles.some((filePath) => filePath === 'AGENTS.md' || filePath === 'agents.md');
  if (agentsFilesChanged) {
    if (!hasAnyLabel(labels, [ORCHESTRATOR_LABEL, ARCHITECTURE_LABEL])) {
      violations.push({
        code: 'agents_approval_missing',
        message: `AGENTS.md changes require '${ORCHESTRATOR_LABEL}' or '${ARCHITECTURE_LABEL}' label`,
      });
    }
    if (actingAgent && actingAgent !== 'orchestrator' && actingAgent !== 'architecture') {
      violations.push({
        code: 'agents_owner_violation',
        message: 'AGENTS.md changes can only be authored by orchestrator or architecture agents',
      });
    }
  }

  validateStageProgress(stageGates, violations);

  if (currentPhase === 2 && activePhase) {
    const blockedSqlChanges = changedFiles.filter((filePath) => pathMatchesAny(filePath, activePhase.blocked_paths));
    if (blockedSqlChanges.length > 0) {
      violations.push({
        code: 'phase2_sql_modification_disallowed',
        message: 'Phase 2 disallows compliance/reporting SQL track modifications',
        details: { files: blockedSqlChanges },
      });
    }
  }

  const requestedPhase = parsePhaseFromHeadRef(headRef);
  if (requestedPhase && requestedPhase > currentPhase) {
    violations.push({
      code: 'phase_not_unlocked',
      message: `Branch phase-${requestedPhase} is ahead of unlocked current_phase ${currentPhase}`,
      details: { requested_phase: requestedPhase, current_phase: currentPhase },
    });
  }

  const stageGatesChanged = changedFiles.includes(STAGE_GATES_FILE);
  if (stageGatesChanged) {
    if (!labels.includes(ORCHESTRATOR_LABEL)) {
      violations.push({
        code: 'stage_gates_orchestrator_label_missing',
        message: `Changes to ${STAGE_GATES_FILE} require '${ORCHESTRATOR_LABEL}' label`,
        file: STAGE_GATES_FILE,
      });
    }
    if (actingAgent !== 'orchestrator') {
      violations.push({
        code: 'stage_gates_owner_violation',
        message: `${STAGE_GATES_FILE} can only be modified by orchestrator agent`,
        file: STAGE_GATES_FILE,
      });
    }

    const baseStageRaw = readGitFile(base, STAGE_GATES_FILE);
    if (baseStageRaw) {
      const baseStage = YAML.parse(baseStageRaw) as StageGatesConfig;
      const baseCurrentPhase = baseStage.progress?.current_phase ?? 1;
      const nextCurrentPhase = stageGates.progress?.current_phase ?? 1;
      if (nextCurrentPhase < baseCurrentPhase) {
        violations.push({
          code: 'stage_phase_regression',
          message: 'current_phase cannot move backwards',
          file: STAGE_GATES_FILE,
          details: { previous: baseCurrentPhase, next: nextCurrentPhase },
        });
      }

      const prevCompleted = new Set(baseStage.progress?.completed_phases ?? []);
      const newlyCompleted = (stageGates.progress?.completed_phases ?? []).filter((phase) => !prevCompleted.has(phase));
      for (const phase of newlyCompleted) {
        const decisionArtifact = `.codex/artifacts/gate-decisions/phase-${phase}.json`;
        if (!changedFiles.includes(decisionArtifact)) {
          violations.push({
            code: 'stage_decision_artifact_not_in_pr',
            message: `Completing phase ${phase} requires ${decisionArtifact} in the same PR`,
            file: decisionArtifact,
          });
        }
      }
    }
  }

  enforceChangeTypePolicy(
    changeType,
    changedFiles,
    protectedContractChanges,
    stageGatesChanged,
    labels,
    violations,
  );

  const outOfBudget = isOutOfBudget(changeType, activePhase, changedFiles);
  if (outOfBudget.outOfBudget) {
    const escalationLabels = [ORCHESTRATOR_LABEL, ARCHITECTURE_LABEL, SECURITY_LABEL];
    if (!hasAllLabels(labels, escalationLabels)) {
      violations.push({
        code: 'risk_budget_escalation_missing',
        message: `Changes exceed risk budget for phase ${currentPhase} and require labels: ${escalationLabels.join(', ')}`,
        details: { reasons: outOfBudget.reasons },
      });
    }
  }

  const selfProtectionTouched = changedFiles.filter((filePath) => GOVERNANCE_SELF_PROTECTED_FILES.has(filePath));
  if (selfProtectionTouched.length > 0) {
    const escalationLabels = [ORCHESTRATOR_LABEL, ARCHITECTURE_LABEL, SECURITY_LABEL];
    if (!hasAllLabels(labels, escalationLabels)) {
      violations.push({
        code: 'governance_self_protection_labels_missing',
        message: `Governance self-protection files require labels: ${escalationLabels.join(', ')}`,
        details: { files: selfProtectionTouched },
      });
    }
  }

  const requiredContractIds = new Set(['graphql-schema', 'route-map', 'selector-map']);
  for (const requiredId of requiredContractIds) {
    const exists = contracts.contracts.some((contract) => contract.contract_id === requiredId);
    if (!exists) {
      violations.push({
        code: 'contracts_required_id_missing',
        message: `Missing required contract_id '${requiredId}' in contracts.yaml`,
        file: '.codex/multi-agent/contracts.yaml',
      });
    }
  }

  const result: GovernanceResult = {
    ok: violations.length === 0,
    base,
    head,
    headRef,
    actingAgent,
    labels: [...labels].sort(),
    changeType,
    changedFiles,
    violations,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main();
