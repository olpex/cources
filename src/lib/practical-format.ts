/** Idempotent plain-text formatting shared by imports, existing tasks and teacher actions. */
export function formatPracticalTask(task: string): string {
  const cleaned = task.replace(/\s+за\s+нотатками\s+до\s+слайдів\s+цього\s+модуля/giu, "");
  return cleaned.split("\n").map((line) => {
    const plain = line.replace(/\*\*/g, "");
    if (/^\s*(?:#{1,6}\s*)?практична\s+робота(?:\s|[№\d.:—–-]|$)/iu.test(plain)) {
      return plain.replace(/^(\s*)(.*?)(\s*)$/, "$1**$2**$3");
    }
    // Only emphasize whole Ukrainian labels, not parts of other words.
    const labels = /(?<![\p{L}\p{N}_])(критерії\s+оцінювання|завдання|оцінювання)(?![\p{L}\p{N}_])/giu;
    return line.split(/(\*\*[^*]+\*\*)/g).map((part) =>
      part.startsWith("**") && part.endsWith("**") ? part : part.replace(labels, "**$1**"),
    ).join("");
  }).join("\n");
}