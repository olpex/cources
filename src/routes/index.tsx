import { createFileRoute } from "@tanstack/react-router";
import { CoursesLanding } from "@/components/CoursesLanding";

const title = "Навчальна платформа викладача — Цифровий світ та Штучний інтелект";
const description =
  "Лендінг викладача: презентації курсів «Цифровий світ для початківців» і «Штучний інтелект» відкриваються одним кліком, а нотатки до кожного слайда — просто в проєкті.";
const url = "https://cources.lovable.app/";

const provider = { "@type": "Organization", name: "Навчальна платформа викладача", url };

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: [
            {
              "@type": "Course",
              name: "Цифровий світ для початківців",
              description:
                "Курс для початківців про базові цифрові навички: презентації, конспекти й тести до кожного заняття.",
              provider,
            },
            {
              "@type": "Course",
              name: "Штучний інтелект: розвиток кар’єри та професійного зростання",
              description:
                "Курс про практичне використання штучного інтелекту для розвитку кар’єри та професійного зростання.",
              provider,
            },
          ].map((c, i) => ({ "@type": "ListItem", position: i + 1, item: c })),
        }),
      },
    ],
  }),
  component: CoursesLanding,
});
