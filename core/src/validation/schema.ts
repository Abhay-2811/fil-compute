import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// ESM default export is not constructable in NodeNext; use CJS require
type ValidateFn = ((data: unknown) => boolean) & { errors?: unknown };
const Ajv = require("ajv") as new (opts?: { strict?: boolean }) => {
  compile: (schema: object) => ValidateFn;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../../../schemas/job-submit-request.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ strict: true });
export const validateJobSubmitRequest = ajv.compile(schema);
