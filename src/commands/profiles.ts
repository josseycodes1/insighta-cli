// src/commands/profiles.ts
import fs from "fs";
import path from "path";
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { apiRequest, ApiError } from "../utils/apiClient.js";
import { loadCredentials } from "../utils/credentials.js";
import {
  printProfilesTable,
  printProfileDetail,
  printError,
  printInfo,
  printSuccess,
  type Profile,
  type PaginationMeta,
} from "../utils/display.js";

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireAuth(): boolean {
  if (!loadCredentials()) {
    printError("Not authenticated. Run `insighta login` first.");
    process.exitCode = 1;
    return false;
  }
  return true;
}

// ── profiles list ─────────────────────────────────────────────────────────────

interface ListOptions {
  gender?: string;
  country?: string;
  ageGroup?: string;
  minAge?: string;
  maxAge?: string;
  sortBy?: string;
  order?: string;
  page?: string;
  limit?: string;
}

export async function profilesListCommand(opts: ListOptions): Promise<void> {
  if (!requireAuth()) return;

  const spinner = ora("Fetching profiles…").start();

  try {
    const query: Record<string, string | number | undefined> = {};
    if (opts.gender) query.gender = opts.gender;
    if (opts.country) query.country = opts.country;
    if (opts.ageGroup) query.age_group = opts.ageGroup;
    if (opts.minAge) query.min_age = opts.minAge;
    if (opts.maxAge) query.max_age = opts.maxAge;
    if (opts.sortBy) query.sort_by = opts.sortBy;
    if (opts.order) query.order = opts.order;
    if (opts.page) query.page = opts.page;
    if (opts.limit) query.limit = opts.limit;

    const { data, raw } = await apiRequest<Profile[]>("GET", "/api/profiles/", {
      query,
    });

    spinner.stop();

    const profiles = Array.isArray(data) ? data : (raw.data as Profile[]) || [];
    const meta: PaginationMeta | undefined =
      raw.total !== undefined
        ? { page: Number(raw.page || query.page || 1), total: raw.total as number }
        : undefined;

    printProfilesTable(profiles, meta);
  } catch (err: unknown) {
    spinner.fail("Failed to fetch profiles");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── profiles get <id> ────────────────────────────────────────────────────────

export async function profilesGetCommand(id: string): Promise<void> {
  if (!requireAuth()) return;

  const spinner = ora(`Fetching profile ${chalk.cyan(id)}…`).start();

  try {
    const { data, raw } = await apiRequest<Profile>(
      "GET",
      `/api/profiles/${id}/`,
    );

    spinner.stop();

    const profile = (data as unknown as Record<string, unknown>)?.id
      ? data
      : (raw.data as Profile) || data;

    printProfileDetail(profile);
  } catch (err: unknown) {
    spinner.fail("Profile not found");
    if (err instanceof ApiError && err.status === 404) {
      printError(`No profile with ID ${chalk.bold(id)}`);
    } else {
      printError(err instanceof Error ? err.message : "Unknown error");
    }
    process.exitCode = 1;
  }
}

// ── profiles search <query> ───────────────────────────────────────────────────

interface SearchOptions {
  page?: string;
  limit?: string;
}

export async function profilesSearchCommand(
  query: string,
  opts: SearchOptions,
): Promise<void> {
  if (!requireAuth()) return;

  const spinner = ora(`Searching: "${chalk.italic(query)}"…`).start();

  try {
    const params: Record<string, string | number | undefined> = { q: query };
    if (opts.page) params.page = opts.page;
    if (opts.limit) params.limit = opts.limit;

    const { data, raw } = await apiRequest<Profile[]>(
      "GET",
      "/api/profiles/search/",
      { query: params },
    );

    spinner.stop();

    const profiles = Array.isArray(data) ? data : (raw.data as Profile[]) || [];
    const meta: PaginationMeta | undefined =
      raw.total !== undefined
        ? { page: Number(params.page || 1), total: raw.total as number }
        : undefined;

    console.log(chalk.dim(`  Natural language query: "${query}"`));
    console.log();
    printProfilesTable(profiles, meta);
  } catch (err: unknown) {
    spinner.fail("Search failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── profiles create ───────────────────────────────────────────────────────────

interface CreateOptions {
  name: string;
}

export async function profilesCreateCommand(
  opts: CreateOptions,
): Promise<void> {
  if (!requireAuth()) return;

  if (!opts.name?.trim()) {
    printError(
      'Name is required. Use: insighta profiles create --name "John Doe"',
    );
    process.exitCode = 1;
    return;
  }

  const spinner = ora(
    `Creating profile for ${chalk.bold(opts.name)}… (fetching external data)`,
  ).start();

  try {
    const { data, raw } = await apiRequest<Profile>("POST", "/api/profiles/", {
      body: { name: opts.name.trim() },
    });

    spinner.succeed(`Profile ready for ${chalk.bold(opts.name)}`);
    console.log();

    const profile = (data as unknown as Record<string, unknown>)?.id
      ? data
      : (raw.data as Profile) || data;

    printProfileDetail(profile);
  } catch (err: unknown) {
    spinner.fail("Failed to create profile");
    if (err instanceof ApiError && err.status === 403) {
      printError(
        "Permission denied. Only admins can create profiles.",
      );
    } else {
      printError(err instanceof Error ? err.message : "Unknown error");
    }
    process.exitCode = 1;
  }
}

// ── profiles delete <id> ──────────────────────────────────────────────────────

export async function profilesDeleteCommand(id: string): Promise<void> {
  if (!requireAuth()) return;

  const creds = loadCredentials()!;
  if (creds.role !== "admin") {
    printError("Only admins can delete profiles.");
    process.exitCode = 1;
    return;
  }

  const spinner = ora(`Deleting profile ${chalk.cyan(id)}…`).start();

  try {
    await apiRequest<null>("DELETE", `/api/profiles/${id}/`);
    spinner.succeed(`Profile ${chalk.cyan(id)} deleted`);
  } catch (err: unknown) {
    spinner.fail("Delete failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── profiles export ───────────────────────────────────────────────────────────

interface ExportOptions {
  format?: string;
  gender?: string;
  country?: string;
  output?: string;
}

export async function profilesExportCommand(
  opts: ExportOptions,
): Promise<void> {
  if (!requireAuth()) return;

  const creds = loadCredentials()!;
  if (creds.role !== "admin") {
    printError(
      "Only admins can export profiles (CSV export endpoint is admin-only).",
    );
    process.exitCode = 1;
    return;
  }

  const spinner = ora("Exporting profiles as CSV…").start();

  try {
    const query: Record<string, string | number | undefined> = {};
    query.format = opts.format || "csv";
    if (opts.gender) query.gender = opts.gender;
    if (opts.country) query.country = opts.country;

    const { data: csvContent } = await apiRequest<string>(
      "GET",
      "/api/profiles/export/",
      { query, responseType: "text" },
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = opts.output || `profiles_${timestamp}.csv`;
    const outputPath = path.resolve(process.cwd(), filename);

    fs.writeFileSync(outputPath, csvContent as string, "utf-8");

    spinner.succeed("Export complete");
    printSuccess(`Saved to: ${chalk.cyan(outputPath)}`);
  } catch (err: unknown) {
    spinner.fail("Export failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function registerProfileCommands(program: Command): void {
  const profiles = program
    .command("profiles")
    .description("Manage and query profiles");

  profiles
    .command("list")
    .description("List all profiles")
    .option("--gender <gender>", "Filter by gender (male|female)")
    .option("--country <country>", "Filter by country code (for example NG)")
    .option("--age-group <group>", "Filter by age group")
    .option("--min-age <n>", "Minimum age")
    .option("--max-age <n>", "Maximum age")
    .option("--sort-by <field>", "Sort by age, created_at, or gender_probability")
    .option("--order <order>", "Sort order (asc|desc)")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page (max 50)", "10")
    .action(profilesListCommand);

  profiles
    .command("get <id>")
    .description("Get a single profile by ID")
    .action(profilesGetCommand);

  profiles
    .command("search <query>")
    .description('Natural language search (e.g. "young females from nigeria")')
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "10")
    .action(profilesSearchCommand);

  profiles
    .command("create")
    .description("Create a profile by name (fetches external data)")
    .requiredOption("--name <name>", "Full name for the profile")
    .action(profilesCreateCommand);

  profiles
    .command("delete <id>")
    .description("Delete a profile by ID (admin only)")
    .action(profilesDeleteCommand);

  profiles
    .command("export")
    .description("Export all profiles to CSV (admin only)")
    .option("--format <format>", "Export format", "csv")
    .option("--gender <gender>", "Filter by gender before export")
    .option("--country <country>", "Filter by country code before export")
    .option(
      "--output <filename>",
      "Output filename (default: profiles_<timestamp>.csv)",
    )
    .action(profilesExportCommand);
}
