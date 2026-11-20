// voice : transcription service (verbatim from the "Voice backend setup" link, which leads to the
// React voice page: https://docs.copilotkit.ai/google-antigravity/voice#custom-transcription-backends).
// HARNESS: the Angular Voice page shows no backend; this React-page file is used as is in server.ts.
import { TranscriptionServiceOpenAI } from "@copilotkit/voice";
import { OpenAI } from "openai";
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1";
export function createTranscriptionService(
  env: NodeJS.ProcessEnv = process.env,
): TranscriptionServiceOpenAI | undefined {
  const apiKey = env.OPENAI_TRANSCRIPTION_API_KEY;
  if (!apiKey) return undefined;
  return new TranscriptionServiceOpenAI({
    openai: new OpenAI({
      apiKey,
      baseURL: env.OPENAI_TRANSCRIPTION_BASE_URL ?? OPENAI_TRANSCRIPTION_URL,
    }),
  });
}
