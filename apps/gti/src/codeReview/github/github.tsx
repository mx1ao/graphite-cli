import type { Operation } from "../../operations/Operation";
import type { CodeReviewSystem, DiffSummary } from "../../types";
import type { UICodeReviewProvider } from "../UICodeReviewProvider";
import type { ReactNode } from "react";

import { Tooltip } from "../../Tooltip";
import { PrSubmitOperation } from "../../operations/PrSubmitOperation";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./GitHubPRBadge.scss";
import type { PRNumber } from "@withgraphite/gti-cli-shared-types";

export class GithubUICodeReviewProvider implements UICodeReviewProvider {
  name = "github";

  constructor(private system: CodeReviewSystem & { type: "github" }) {}

  DiffBadgeContent({
    diff,
    children,
  }: {
    diff?: DiffSummary;
    children?: ReactNode;
  }): JSX.Element | null {
    if (diff != null && diff?.type !== "github") {
      return null;
    }
    return (
      <div
        className={`github-diff-status${
          diff?.state ? " github-diff-status-" + diff.state : ""
        }`}
      >
        <Tooltip title={"Click to open Pull Request in GitHub"} delayMs={500}>
          {diff && <Icon icon={iconForPRState(diff.state)} />}
          {diff?.state && <PRStateLabel state={diff.state} />}
          {children}
        </Tooltip>
      </div>
    );
  }

  formatDiffNumber(diffId: PRNumber): string {
    return `#${diffId}`;
  }

  RepoInfo = () => {
    return (
      <span>
        {this.system.hostname !== "github.com" ? this.system.hostname : ""}{" "}
        {this.system.owner}/{this.system.repo}
      </span>
    );
  };

  submitOperation(): Operation {
    return new PrSubmitOperation();
  }
}

type BadgeState = "Open" | "Merged" | "Closed" | "ERROR";

function iconForPRState(state?: BadgeState) {
  switch (state) {
    case "ERROR":
      return "error";
    case "Open":
      return "git-pull-request";
    case "Merged":
      return "git-merge";
    case "Closed":
      return "git-pull-request-closed";
    default:
      return "git-pull-request";
  }
}

function PRStateLabel({ state }: { state: BadgeState }) {
  switch (state) {
    case "Open":
      return <>Open</>;
    case "Merged":
      return <>Merged</>;
    case "Closed":
      return <>Closed</>;
    case "ERROR":
      return <>Error</>;
    default:
      return <>{state}</>;
  }
}