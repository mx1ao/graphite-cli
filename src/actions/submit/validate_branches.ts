import chalk from 'chalk';
import prompts from 'prompts';
import { execStateConfig } from '../../lib/config/exec_state_config';
import { TContext } from '../../lib/context/context';
import {
  KilledError,
  PreconditionsFailedError,
  ValidationFailedError,
} from '../../lib/errors';
import { currentBranchPrecondition } from '../../lib/preconditions';
import { syncPRInfoForBranches } from '../../lib/sync/pr_info';
import { logError, logInfo, logNewline, logWarn } from '../../lib/utils';
import { isEmptyBranch } from '../../lib/utils/is_empty_branch';
import { MetaStackBuilder, Stack } from '../../wrapper-classes';
import { Branch } from '../../wrapper-classes/branch';
import { TScope } from '../scope';
import { validateStack } from '../validate';
import { TSubmitScope } from './submit';

export async function getValidBranchesToSubmit(
  scope: TSubmitScope,
  context: TContext
): Promise<Branch[]> {
  logInfo(
    chalk.blueBright(
      `✏️  [Step 1] Validating that this Graphite stack is ready to submit...`
    )
  );

  const branchesToSubmit = getAllBranchesToSubmit(scope, context);

  await syncPRInfoForBranches(branchesToSubmit, context);

  return hasAnyMergedBranches(branchesToSubmit) ||
    hasAnyClosedBranches(branchesToSubmit)
    ? []
    : await checkForEmptyBranches(branchesToSubmit, context);
}

function getAllBranchesToSubmit(
  scope: TSubmitScope,
  context: TContext
): Branch[] {
  if (scope === 'BRANCH') {
    const currentBranch = currentBranchPrecondition(context);
    return [currentBranch];
  }

  try {
    const stack = getStack(
      {
        currentBranch: currentBranchPrecondition(context),
        scope: scope,
      },
      context
    );
    validateStack(scope, stack, context);
    logNewline();
    return stack.branches().filter((b) => !b.isTrunk(context));
  } catch {
    throw new ValidationFailedError(`Validation failed. Will not submit.`);
  }
}

function getStack(
  args: { currentBranch: Branch; scope: TScope },
  context: TContext
): Stack {
  switch (args.scope) {
    case 'UPSTACK':
      return new MetaStackBuilder().upstackInclusiveFromBranchWithParents(
        args.currentBranch,
        context
      );
    case 'DOWNSTACK':
      return new MetaStackBuilder().downstackFromBranch(
        args.currentBranch,
        context
      );
    case 'FULLSTACK':
      return new MetaStackBuilder().fullStackFromBranch(
        args.currentBranch,
        context
      );
  }
}

function hasAnyMergedBranches(branchesToSubmit: Branch[]): boolean {
  const mergedBranches = branchesToSubmit.filter(
    (b) => b.getPRInfo()?.state === 'MERGED'
  );
  if (mergedBranches.length === 0) {
    return false;
  }

  const hasMultipleBranches = mergedBranches.length > 1;

  logError(
    `PR${hasMultipleBranches ? 's' : ''} for the following branch${
      hasMultipleBranches ? 'es have' : ' has'
    } already been merged:`
  );
  mergedBranches.forEach((b) => logError(`▸ ${chalk.reset(b.name)}`));
  logError(
    `If this is expected, you can use 'gt repo sync' to delete ${
      hasMultipleBranches ? 'these branches' : 'this branch'
    } locally and restack dependencies.`
  );

  return true;
}

function hasAnyClosedBranches(branchesToSubmit: Branch[]): boolean {
  const closedBranches = branchesToSubmit.filter(
    (b) => b.getPRInfo()?.state === 'CLOSED'
  );
  if (closedBranches.length === 0) {
    return false;
  }

  const hasMultipleBranches = closedBranches.length > 1;

  logError(
    `PR${hasMultipleBranches ? 's' : ''} for the following branch${
      hasMultipleBranches ? 'es have' : ' has'
    } been closed:`
  );
  closedBranches.forEach((b) => logError(`▸ ${chalk.reset(b.name)}`));
  logError(
    `To submit ${
      hasMultipleBranches ? 'these branches' : 'this branch'
    }, please reopen the PR remotely.`
  );

  return true;
}

export async function checkForEmptyBranches(
  submittableBranches: Branch[],
  context: TContext
): Promise<Branch[]> {
  const emptyBranches = submittableBranches.filter((branch) =>
    isEmptyBranch(branch.name, getBranchBaseName(branch, context))
  );
  if (emptyBranches.length === 0) {
    return submittableBranches;
  }

  const hasMultipleBranches = emptyBranches.length > 1;

  logWarn(
    `The following branch${
      hasMultipleBranches ? 'es have' : ' has'
    } no changes:`
  );
  emptyBranches.forEach((b) => logWarn(`▸ ${chalk.reset(b.name)}`));
  logWarn(
    `Are you sure you want to submit ${hasMultipleBranches ? 'them' : 'it'}?`
  );
  logNewline();

  if (!execStateConfig.interactive()) {
    return [];
  }

  const response = await prompts(
    {
      type: 'select',
      name: 'empty_branches_options',
      message: `How would you like to proceed?`,
      choices: [
        {
          title: `Abort command and keep working on ${
            hasMultipleBranches ? 'these branches' : 'this branch'
          }`,
          value: 'fix_manually',
        },
        {
          title: `Continue with empty branch${hasMultipleBranches ? 'es' : ''}`,
          value: 'continue_empty',
        },
      ],
    },
    {
      onCancel: () => {
        throw new KilledError();
      },
    }
  );
  logNewline();

  return response.empty_branches_options === 'continue_empty'
    ? submittableBranches
    : [];
}

function getBranchBaseName(branch: Branch, context: TContext): string {
  const parent = branch.getParentFromMeta(context);
  if (parent === undefined) {
    throw new PreconditionsFailedError(
      `Could not find parent for branch ${branch.name} to submit PR against. Please checkout ${branch.name} and run \`gt upstack onto <parent_branch>\` to set its parent.`
    );
  }
  return parent.name;
}