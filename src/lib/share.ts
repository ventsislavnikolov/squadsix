/**
 * Hand text to the Messenger group: the phone's share sheet where there is one, the
 * clipboard otherwise. Returns "copied" when it fell back to the clipboard, so the
 * button can say so.
 */
export async function shareText(
  text: string
): Promise<"shared" | "copied" | "dismissed"> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return "shared";
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return "dismissed"; // closed the share sheet
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
