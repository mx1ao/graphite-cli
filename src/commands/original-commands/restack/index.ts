import chalk from "chalk";
import { execSync } from "child_process";
import yargs from "yargs";
import AbstractCommand from "../../../lib/abstract_command";
import { log } from "../../../lib/log";
import {
  checkoutBranch,
  CURRENT_REPO_CONFIG_PATH,
  logErrorAndExit,
  rebaseInProgress,
  trunkBranches,
  uncommittedChanges,
} from "../../../lib/utils";
import Branch from "../../../wrapper-classes/branch";
import PrintStacksCommand from "../print-stacks";
import ValidateCommand from "../validate";

const args = {
  silent: {
    describe: `silence output from the command`,
    demandOption: false,
    default: false,
    type: "boolean",
    alias: "s",
  },
  onto: {
    describe: `A branch to restack the current stack onto`,
    demandOption: false,
    optional: true,
    type: "string",
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

function getParentForRebaseOnto(branch: Branch, argv: argsT): Branch {
  const parent = branch.getParentFromMeta();
  if (!parent) {
    log(
      chalk.red(
        `Cannot "restack --onto", (${branch.name}) has no parent as defined by the meta.`
      ),
      argv
    );
    process.exit(1);
  }
  return parent;
}

export default class RestackCommand extends AbstractCommand<typeof args> {
  static args = args;
  public async _execute(argv: argsT): Promise<void> {
    if (uncommittedChanges()) {
      logErrorAndExit("Cannot restack with uncommitted changes");
    }
    // Print state before
    log(`Before restack:`, argv);
    !argv.silent && (await new PrintStacksCommand().executeUnprofiled(args));

    const originalBranch = Branch.getCurrentBranch();
    if (originalBranch === null) {
      logErrorAndExit(`Not currently on a branch; no target to restack.`);
    }

    if (argv.onto) {
      await restackOnto(originalBranch, argv.onto, argv);
    } else {
      for (const child of await originalBranch.getChildrenFromMeta()) {
        await restackBranch(child, argv);
      }
    }
    checkoutBranch(originalBranch.name);

    // Print state after
    log(`After restack:`, argv);
    !argv.silent && (await new PrintStacksCommand().executeUnprofiled(args));
  }
}

function checkBranchCanBeMoved(branch: Branch, opts: argsT) {
  if (trunkBranches && branch.name in trunkBranches) {
    log(
      chalk.red(
        `Cannot restack (${branch.name}) onto ${opts.onto}, (${branch.name}) is listed in (${CURRENT_REPO_CONFIG_PATH}) as a trunk branch.`
      ),
      opts
    );
    process.exit(1);
  }
}

async function validate(argv: argsT) {
  try {
    await new ValidateCommand().executeUnprofiled({ silent: true });
  } catch {
    log(
      chalk.red(
        `Cannot "restack --onto", git derived stack must match meta defined stack. Consider running "restack" or "fix" first.`
      ),
      argv
    );
    process.exit(1);
  }
}

async function restackOnto(currentBranch: Branch, onto: string, argv: argsT) {
  // Check that the current branch has a parent to prevent moving main
  checkBranchCanBeMoved(currentBranch, argv);
  await validate(argv);
  const parent = getParentForRebaseOnto(currentBranch, argv);
  // Save the old ref from before rebasing so that children can find their bases.
  currentBranch.setMetaPrevRef(currentBranch.getCurrentRef());
  execSync(
    `git rebase --onto ${onto} $(git merge-base ${currentBranch.name} ${parent.name}) ${currentBranch.name}`,
    { stdio: "ignore" }
  );
  // set current branch's parent only if the rebase succeeds.
  currentBranch.setParentBranchName(onto);
  // Now perform a restack starting from the onto branch:
  for (const child of await currentBranch.getChildrenFromMeta()) {
    await restackBranch(child, argv);
  }
}

export async function restackBranch(
  currentBranch: Branch,
  opts: argsT
): Promise<void> {
  if (rebaseInProgress()) {
    logErrorAndExit(
      `Interactive rebase in progress, cannot restack (${currentBranch.name}). Complete the rebase and re-run restack command.`
    );
  }
  const parentBranch = currentBranch.getParentFromMeta();
  if (!parentBranch) {
    logErrorAndExit(
      `Cannot find parent from meta defined stack for (${currentBranch.name}), stopping restack`
    );
  }
  const mergeBase = currentBranch.getMetaMergeBase();
  if (!mergeBase) {
    logErrorAndExit(
      `Cannot find a merge base from meta defined stack for (${currentBranch.name}), stopping restack`
    );
  }

  currentBranch.setMetaPrevRef(currentBranch.getCurrentRef());
  checkoutBranch(currentBranch.name);
  execSync(
    `git rebase --onto ${parentBranch.name} ${mergeBase} ${currentBranch.name}`,
    { stdio: "ignore" }
  );

  for (const child of await currentBranch.getChildrenFromMeta()) {
    await restackBranch(child, opts);
  }
}