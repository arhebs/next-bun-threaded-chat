import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const skipValidation =
  process.env.MOCK_CHAT === "1" || process.env.PLAYWRIGHT === "1";

export const env = createEnv({
  server: {
    OPENAI_API_KEY: z.string().trim().min(1),
    OPENAI_BASE_URL: z.string().trim().min(1).optional(),
    OPENAI_MODEL: z.string().trim().min(1).optional(),
    OPENAI_API_MODE: z.enum(["chat", "responses"]).optional(),
    OPENAI_REFERER: z.string().trim().min(1).optional(),
    OPENAI_TITLE: z.string().trim().min(1).optional(),

    MOCK_CHAT: z.enum(["1"]).optional(),
    PLAYWRIGHT: z.enum(["1"]).optional(),
  },
  client: {},
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_API_MODE: process.env.OPENAI_API_MODE,
    OPENAI_REFERER: process.env.OPENAI_REFERER,
    OPENAI_TITLE: process.env.OPENAI_TITLE,
    MOCK_CHAT: process.env.MOCK_CHAT,
    PLAYWRIGHT: process.env.PLAYWRIGHT,
  },
  emptyStringAsUndefined: true,
  skipValidation,
  isServer: true,
});
