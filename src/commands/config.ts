// src/commands/config.ts
import { Command } from "commander";
import chalk from "chalk";
import { loadCredentials } from "../utils/credentials.js";
import { API_BASE } from "../utils/apiClient.js";
import { printInfo } from "../utils/display.js";
// @ts-ignore
import Table from "cli-table3";

export async function configShowCommand(): Promise<void> {
  const creds = loadCredentials();

  const table = new Table({
    style: { border: ["grey"] },
    colWidths: [24, 48],
  });

  table.push(
    [chalk.cyan("API URL"), chalk.bold(API_BASE)],
    [
      chalk.cyan("Auth Status"),
      creds
        ? chalk.green(`Logged in as ${creds.email}`)
        : chalk.dim("Not logged in"),
    ],
    [
      chalk.cyan("Credentials File"),
      chalk.dim(
        `${process.env.HOME || "~"}/.insighta/credentials.json`,
      ),
    ],
    [
      chalk.cyan("Override API URL"),
      chalk.dim("Set env var: INSIGHTA_API_URL=https://your-api.com"),
    ],
  );

  console.log();
  console.log(chalk.bold("  Insighta Labs+ CLI Configuration"));
  console.log();
  console.log(table.toString());
}

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Show CLI configuration");

  config
    .command("show")
    .description("Display current configuration")
    .action(configShowCommand);

  // Allow `insighta config` alone to also show config
  config.action(configShowCommand);
}
