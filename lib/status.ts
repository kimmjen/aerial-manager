import { isMovCompatible } from "./transcode";

export type LibraryStatus = "ready" | "incompatible" | "converting" | "error";

export interface JobState {
  status: "converting" | "error";
}

/** Derive a library item's status from its codec and any running conversion job. */
export function deriveLibraryStatus(codec: string | null, job: JobState | undefined): LibraryStatus {
  if (job?.status === "converting") return "converting";
  if (job?.status === "error") return "error";
  return isMovCompatible(codec) ? "ready" : "incompatible";
}
