import { config } from "dotenv";
import path from "node:path";

// Load the TEST database URL before any test imports the Prisma client.
config({ path: path.resolve(process.cwd(), ".env.test") });
