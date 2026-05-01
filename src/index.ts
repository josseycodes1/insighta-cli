import { Command } from "commander";
import chalk from "chalk";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProfileCommands } from "./commands/profiles.js";
import { registerConfigCommands } from "./commands/config.js";

const program = new Command();

program
  .name("insighta")
  .description(
    chalk.bold("Insighta Labs+") +
      chalk.dim(" — Profile Intelligence CLI\n") +
      chalk.dim("  Backend: ") +
      chalk.cyan(process.env.INSIGHTA_API_URL || "http://localhost:8000"),
  )
  .version("1.0.0", "-v, --version", "Show version")
  .helpOption("-h, --help", "Show help");

registerAuthCommands(program);
registerProfileCommands(program);
registerConfigCommands(program);

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  if (err instanceof Error && "code" in err) {
    const code = (err as { code: string }).code;

    if (code === "commander.helpDisplayed" || code === "commander.version") {
      process.exit(0);
    }
    if (code === "commander.unknownCommand") {
      console.error(
        chalk.red("✖ Unknown command."),
        "Run",
        chalk.cyan("insighta --help"),
      );
      process.exit(1);
    }
  }
  throw err;
}
