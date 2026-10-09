/** Button-only labels: original titles, task content and submission IDs stay untouched. */
export function shortPracticalTopic(title: string, task: string): string {
  const clean = (text: string) => text.replace(/\*\*|^\s*#{1,6}\s*/g, "")
    .replace(/^\s*практична\s+робота\s*(?:№\s*)?(?:\d+(?:[.,]\d+)*[.)]?)?\s*[:—–.\-]?\s*/iu, "")
    .replace(/^[«“"']|[»”"']$/g, "").trim();
  const heading = task.split("\n").find((line) => /^\s*(?:\*\*|#{1,6}\s*)?практична\s+робота/iu.test(line));
  let topic = clean(title) || clean(heading ?? "");
  if (!topic) {
    const instruction = task.split("\n").find((line) => {
      const text = clean(line).replace(/^\s*\d+[.)]\s*/, "");
      return text && !/^(завдання|критерії|оцінювання|що\s+здати|мета|роботу\s+перевіряє)/iu.test(text);
    });
    topic = clean(instruction ?? "").replace(/^\s*\d+[.)]\s*/, "");
  }
  const words = topic.split(/[:;]|\s+[—–]\s+/)[0]?.split(/\s+/).filter(Boolean).slice(0, 3) ?? [];
  // Avoid ending a short topic on a connective word.
  if (words.length > 2 && /^(і|й|та|з|із|у|в|для|на|до|за|без|проти|через)$/iu.test(words[words.length - 1] ?? "")) words.pop();
  return words.join(" ").replace(/[,:;.!?—–-]+$/, "") || "Практична робота";
}