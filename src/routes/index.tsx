import { createFileRoute } from "@tanstack/react-router";
import { CoursesLanding } from "@/components/CoursesLanding";

const title = "Презентації курсів для викладача — Цифровий світ та Штучний інтелект";
const description =
  "Лендінг викладача: презентації курсів «Цифровий світ для початківців» і «Штучний інтелект» відкриваються одним кліком, а нотатки до кожного слайда — просто в проєкті.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoursesLanding,
});
