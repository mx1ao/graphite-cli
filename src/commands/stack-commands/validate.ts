import yargs from "yargs";
import { validate } from "../../actions/validate";
import { profiledHandler } from "../../lib/telemetry";

const args = {
  silent: {
    describe: `silence output from the command`,
    demandOption: false,
    default: false,
    type: "boolean",
    alias: "s",
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = "validate";
export const description =
  "Validates that the current stack matches git's chain of branches.";
export const builder = args;

export const handler = async (argv: argsT): Promise<void> => {
  return profiledHandler(command, async () => {
    await validate("FULLSTACK", argv.silent);
  });
};