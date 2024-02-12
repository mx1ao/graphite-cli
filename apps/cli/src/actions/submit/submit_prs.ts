import { API_ROUTES } from '@withgraphite/graphite-cli-routes';
import * as t from '@withgraphite/retype';
import chalk from 'chalk';
import { requestWithArgs } from '../../lib/api/request';
import { TContext } from '../../lib/context';
import { ExitFailedError, PreconditionsFailedError } from '../../lib/errors';
import { cuteString } from '../../lib/utils/cute_string';
import { Unpacked } from '../../lib/utils/ts_helpers';

export type TPRSubmissionInfo = t.UnwrapSchemaMap<
  typeof API_ROUTES.submitPullRequests.params
>['prs'];

type TSubmittedPRRequest = Unpacked<TPRSubmissionInfo>;

type TSubmittedPRResponse = Unpacked<
  t.UnwrapSchemaMap<typeof API_ROUTES.submitPullRequests.response>['prs']
>;

type TSubmittedPR = {
  request: TSubmittedPRRequest;
  response: TSubmittedPRResponse;
};

export async function submitPullRequest(
  args: {
    submissionInfo: TPRSubmissionInfo;
    mergeWhenReady: boolean;
    trunkBranchName: string;
    cliAuthToken: string;
  },
  context: TContext
): Promise<void> {
  const pr = (
    await requestServerToSubmitPRs({
      submissionInfo: args.submissionInfo,
      mergeWhenReady: args.mergeWhenReady,
      trunkBranchName: args.trunkBranchName,
      context,
    })
  )[0];

  if (pr.response.status === 'error') {
    throw new ExitFailedError(
      `Failed to submit PR for ${pr.response.head}: ${parseSubmitError(
        pr.response.error
      )}`
    );
  }

  context.engine.upsertPrInfo(pr.response.head, {
    number: pr.response.prNumber,
    url: pr.response.prURL,
    base: pr.request.base,
    state: 'OPEN', // We know this is not closed or merged because submit succeeded
    ...(pr.request.action === 'create'
      ? {
          title: pr.request.title,
          body: pr.request.body,
          reviewDecision: 'REVIEW_REQUIRED', // Because we just opened this PR
        }
      : {}),
    ...(pr.request.draft !== undefined ? { draft: pr.request.draft } : {}),
  });
  context.splog.info(
    `${chalk.green(pr.response.head)}: ${pr.response.prURL} (${{
      updated: chalk.yellow,
      created: chalk.green,
    }[pr.response.status](pr.response.status)})`
  );
}

function parseSubmitError(error: string): string {
  try {
    return JSON.parse(error)?.response?.data?.message ?? error;
  } catch {
    return error;
  }
}

const SUCCESS_RESPONSE_CODE = 200;
const UNAUTHORIZED_RESPONSE_CODE = 401;

// This endpoint is plural for legacy reasons.
// Leaving the function plural in case we want to revert.
async function requestServerToSubmitPRs({
  submissionInfo,
  mergeWhenReady,
  trunkBranchName,
  context,
}: {
  submissionInfo: TPRSubmissionInfo;
  mergeWhenReady: boolean;
  trunkBranchName: string;
  context: TContext;
}): Promise<TSubmittedPR[]> {
  // eslint-disable-next-line no-console
  console.log(submissionInfo);
  const response = await requestWithArgs(
    context.userConfig,
    API_ROUTES.submitPullRequests,
    {
      repoOwner: context.repoConfig.getRepoOwner(),
      repoName: context.repoConfig.getRepoName(),
      mergeWhenReady,
      trunkBranchName,
      prs: submissionInfo,
    }
  );

  if (
    response._response.status === SUCCESS_RESPONSE_CODE &&
    response._response.body
  ) {
    const requests: { [head: string]: TSubmittedPRRequest } = {};
    submissionInfo.forEach((prRequest) => {
      requests[prRequest.head] = prRequest;
    });

    return response.prs.map((prResponse) => {
      return {
        request: requests[prResponse.head],
        response: prResponse,
      };
    });
  } else if (response._response.status === UNAUTHORIZED_RESPONSE_CODE) {
    throw new PreconditionsFailedError(
      `Your Graphite auth token is invalid/expired.\n\nPlease obtain a new auth token by visiting ${context.userConfig.getAppServerUrl()}/activate`
    );
  } else {
    const { headers } = response._response;
    const debugHeaders = {
      'x-graphite-request-id': headers.get('x-graphite-request-id'),
    };
    const formattedHeaders = Object.entries(debugHeaders)
      .map(([key, value]) => `  ${key}: ${value || '<empty>'}`)
      .join('\n');

    throw new ExitFailedError(
      `Unexpected server response (${
        response._response.status
      }).\n\nHeaders:\n${formattedHeaders}\n\nResponse: ${cuteString(response)}`
    );
  }
}
