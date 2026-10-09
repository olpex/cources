/** Idempotent plain-text formatting shared by imports, existing tasks and teacher actions. */
export function formatPracticalTask(task: string): string {
  const cleaned = task.replace(/\s+за\s+нотатками\s+до\s+слайдів\s+цього\s+модуля/giu, "");
  return cleaned.split("\n").map((line) => {
    const plain = line.replace(/\*\*/g, "");
    if (/^\s*(?:#{1,6}\s*)?практична\s+робота(?:\s|[№\d.:—–-]|$)/iu.test(plain)) {
      return plain.replace(/^(\s*)(.*?)(\s*)$/, "$1**$2**$3");
    }
    // Emphasize section labels, not the same words used within ordinary sentences.
    const label = /^(\s*(?:#{1,6}\s*)?)(критерії\s+оцінювання|що\s+здати|завдання|оцінювання)(?=\s*[:.\-—–]|\s*$)/iu;
    if (label.test(plain)) return plain.replace(label, "$1**$2**");
    return line;
  }).join("\n");
}