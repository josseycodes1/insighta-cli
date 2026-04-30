// src/utils/display.ts
import chalk from "chalk";
// @ts-ignore — cli-table3 types are loose
import Table from "cli-table3";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string | number;
  name: string;
  gender?: string;
  age?: number;
  age_group?: string;
  country_id?: string;
  created_at?: string;
  gender_probability?: number;
}

export interface PaginationMeta {
  page: number;
  total: number;
}

// ── Print helpers ────────────────────────────────────────────────────────────

export function printSuccess(msg: string): void {
  console.log(chalk.green("✔"), msg);
}

export function printError(msg: string): void {
  console.error(chalk.red("✖"), chalk.red(msg));
}

export function printInfo(msg: string): void {
  console.log(chalk.cyan("ℹ"), msg);
}

export function printWarning(msg: string): void {
  console.log(chalk.yellow("⚠"), msg);
}

// ── Profile table ────────────────────────────────────────────────────────────

function genderBadge(gender?: string): string {
  if (!gender) return chalk.dim("—");
  return gender.toLowerCase() === "male"
    ? chalk.blue(gender)
    : chalk.magenta(gender);
}

function roleBadge(role: string): string {
  return role === "admin" ? chalk.red.bold("admin") : chalk.blue("analyst");
}

export function printProfilesTable(
  profiles: Profile[],
  meta?: PaginationMeta,
): void {
  if (!profiles || profiles.length === 0) {
    printInfo("No profiles found.");
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Name"),
      chalk.cyan("Gender"),
      chalk.cyan("Age"),
      chalk.cyan("Age Group"),
      chalk.cyan("Country"),
      chalk.cyan("Created"),
    ],
    style: { border: ["grey"], head: [] },
    colWidths: [6, 22, 10, 6, 12, 10, 24],
    wordWrap: true,
  });

  for (const p of profiles) {
    table.push([
      chalk.dim(String(p.id)),
      chalk.bold(p.name),
      genderBadge(p.gender),
      p.age !== undefined && p.age !== null ? String(p.age) : chalk.dim("—"),
      p.age_group || chalk.dim("—"),
      p.country_id || chalk.dim("—"),
      p.created_at
        ? new Date(p.created_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : chalk.dim("—"),
    ]);
  }

  console.log(table.toString());

  if (meta) {
    console.log(
      chalk.dim(`  Page ${meta.page} · ${meta.total} total profile(s)`),
    );
  }
  console.log();
}

export function printProfileDetail(profile: Profile): void {
  const table = new Table({
    style: { border: ["grey"] },
    colWidths: [22, 40],
  });

  table.push(
    [chalk.cyan("ID"), chalk.dim(String(profile.id))],
    [chalk.cyan("Name"), chalk.bold(profile.name)],
    [chalk.cyan("Gender"), genderBadge(profile.gender)],
    [
      chalk.cyan("Age"),
      profile.age !== undefined && profile.age !== null
        ? String(profile.age)
        : chalk.dim("—"),
    ],
    [chalk.cyan("Age Group"), profile.age_group || chalk.dim("—")],
    [chalk.cyan("Country"), profile.country_id || chalk.dim("—")],
    [
      chalk.cyan("Gender Probability"),
      profile.gender_probability !== undefined
        ? `${(profile.gender_probability * 100).toFixed(1)}%`
        : chalk.dim("—"),
    ],
    [
      chalk.cyan("Created"),
      profile.created_at
        ? new Date(profile.created_at).toLocaleString()
        : chalk.dim("—"),
    ],
  );

  console.log(table.toString());
}

export function printAuthTable(email: string, role: string): void {
  const table = new Table({
    style: { border: ["grey"] },
    colWidths: [16, 40],
  });
  table.push(
    [chalk.cyan("Email"), chalk.bold(email)],
    [chalk.cyan("Role"), roleBadge(role)],
  );
  console.log();
  console.log(table.toString());
}
