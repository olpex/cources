export type PresentationMeta = {
  id: string;
  title: string;
  url: string;
  slides: number;
};

export type Course = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  presentations: PresentationMeta[];
};

export type SlideNote = {
  n: number;
  kind: string;
  paragraphs: string[];
  sources: string;
};

export type PresentationNotes = {
  id: string;
  title: string;
  url: string;
  slides: SlideNote[];
};

export const digitalCourse: Course = {
  slug: "digital",
  title: "Цифровий світ для початківців",
  subtitle: "Базова цифрова грамотність і безпека",
  description:
    "Дев’ять готових презентацій для аудиторного заняття: від основ кібербезпеки до державних онлайн-сервісів. Нотатки викладача відкриваються прямо тут, без переходу в Google Документи.",
  presentations: [
    {
      id: "p1",
      title: "Вступ. Цифрова та кібербезпека",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQAudRPg8VzrTKbzOMRRC1FkAYT-l6ASTDFTV0fLGIi8WdY",
      slides: 18,
    },
    {
      id: "p2",
      title: "Безпека ОС Windows 10, 11",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQDHgMgXjWeoS4X-urxrFtOKAbH3u-oQUsoOHz3PrmF9rx4",
      slides: 35,
    },
    {
      id: "p3",
      title: "Ефективний пошук інформації",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQDQT_CluWgwS54WcGYFt0ubAXKmcuBRdSNhhaEw64pMduA",
      slides: 20,
    },
    {
      id: "p4",
      title: "Дезінформація і фактчекінг",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQCE1xgzXJANR75yPv9U-HW6AU9Lu5LSutf4o19kOyd5q70",
      slides: 32,
    },
    {
      id: "p5",
      title: "Безпечне використання соціальних мереж",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQAdJ6DcXVFJTJcUpXiY1iB8ASKQk_UoHyDwsc9_b36cJF8",
      slides: 26,
    },
    {
      id: "p6",
      title: "Безпечне використання месенджерів",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQA8z-GzOB5uT7lThdLT4HSbASFQN-8mxQasMpiBDNekjmI",
      slides: 32,
    },
    {
      id: "p7",
      title: "Приватність і безпека під час вебперегляду",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQDZXyhLHQIyTLxrGhj7oNkUAUWpbTr6CTCxN6nZrLm7pYA",
      slides: 25,
    },
    {
      id: "p8",
      title: "Українські державні онлайн-сервіси",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQBso5MvkmQ-R6wHfdkPe4zXAWqRDZcbVENZdIyStMxnOfg",
      slides: 32,
    },
    {
      id: "p9",
      title: "Розпізнавання шахрайства онлайн",
      url: "https://1drv.ms/p/c/fb983be9ba74879e/IQD9pW81Qm3OS6v2ZcynjnC0AeJ_xTI25Sm5jIwyvf2jfAY",
      slides: 30,
    },
  ],
};

export const aiCourse: Course = {
  slug: "ai",
  title: "Штучний інтелект",
  subtitle: "Розвиток кар’єри та професійного зростання",
  description:
    "Модуль про використання штучного інтелекту для кар’єри та професійного зростання. Презентації та нотатки додамо, щойно ви надасте посилання.",
  presentations: [],
};

export const courses: Course[] = [digitalCourse, aiCourse];

export async function fetchNotes(id: string): Promise<PresentationNotes> {
  const res = await fetch(`/notes/${id}.json`);
  if (!res.ok) throw new Error("Не вдалося завантажити нотатки");
  return (await res.json()) as PresentationNotes;
}
