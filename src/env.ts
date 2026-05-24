import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

let dotEnvLoaded = false;

export function loadDotEnv(): void {
  if (dotEnvLoaded) {
    return;
  }

  dotEnvLoaded = true;

  const envFile = process.env.POSTMASTER_DOTENV_FILE ?? ".env";
  const envPath = resolve(process.cwd(), envFile);

  if (!existsSync(envPath)) {
    if (process.env.POSTMASTER_DOTENV_FILE) {
      throw new Error(`POSTMASTER_DOTENV_FILE does not exist: ${envPath}`);
    }

    return;
  }

  const result = config({ path: envPath, quiet: true });
  if (result.error) {
    throw result.error;
  }
}
