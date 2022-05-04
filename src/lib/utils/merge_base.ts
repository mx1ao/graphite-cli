import { gpExecSync } from './exec_sync';

export function getMergeBase(left: string, right: string): string {
  return gpExecSync({ command: `git merge-base ${left} ${right}` })
    .toString()
    .trim();
}