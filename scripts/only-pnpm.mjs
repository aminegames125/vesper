// Vesper is a pnpm monorepo. This runs before `install` and stops npm and yarn early.
const agent = process.env.npm_config_user_agent ?? "";
if (!agent.startsWith("pnpm/")) {
  console.error("\nThis repository uses pnpm only. Install it with `corepack enable` (or https://pnpm.io/installation), then run `pnpm install`.\n");
  process.exit(1);
}
