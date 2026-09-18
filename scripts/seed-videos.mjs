// Circuit Video Feed — Phase 1 mock content seed.
//
// One-off script, not a persistent `npm run seed`: Phase 1 explicitly ships
// with mock Circuit content (real admin upload/publish tooling is Phase 2).
// Video files are Google's public GTV sample-video bucket (freely usable,
// commonly used for exactly this kind of demo/test content) — stand-ins for
// real gaming clips, which Circuit has no video assets for yet. Titles/
// tags/games are written as if they were real Circuit clips so the feed
// reads correctly; three rows link to tournaments that are genuinely real
// in this database, exercising the "View Tournament" deep link for real.
//
// Run once against a dev database: `node scripts/seed-videos.mjs`

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The Google GTV sample bucket this originally used is no longer publicly
// readable (403s as of this writing) — these two MDN-hosted CC0 clips are
// verified reachable and playable instead. Fewer distinct files than
// ideal for 12 rows, but Phase 1's mock content only needs to exercise
// the feed mechanics, not offer unique footage per row.
const SAMPLE_FILES = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
];

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  const tournaments = await prisma.tournament.findMany({
    select: { id: true, name: true, game: true },
  });
  const byGame = Object.fromEntries(tournaments.map((t) => [t.game, t]));

  const rows = [
    {
      title: "CODM-Masters — grand final match point",
      description: "The winning play that closed out CODM-Masters. GG.",
      game: "Call of Duty",
      tags: ["highlight", "tournament", "final"],
      tournament: byGame["Call of Duty"],
    },
    {
      title: "Lagos Open — golden goal in the 89th minute",
      description: "Lagos Open's Efootball final came down to stoppage time.",
      game: "Efootball",
      tags: ["highlight", "tournament", "efootball"],
      tournament: byGame["Efootball"],
    },
    {
      title: "Circuit Demo Cup — champion crowned",
      description: "How the Circuit Demo Cup bracket wrapped up, round by round.",
      game: "Call of Duty Mobile",
      tags: ["highlight", "tournament", "codm"],
      tournament: byGame["Call of Duty Mobile"],
    },
    {
      title: "3 angles you're not using enough in COD Mobile",
      description: "Quick tips clip — map control basics for ranked.",
      game: "Call of Duty Mobile",
      tags: ["tips", "codm"],
    },
    {
      title: "Valorant clutch: 1v3 eco round",
      description: "Community clip from a Circuit Challenge.",
      game: "Valorant",
      tags: ["clutch", "challenge"],
    },
    {
      title: "Apex Legends — third-party done right",
      description: "Reading a fight before you enter it.",
      game: "Apex Legends",
      tags: ["tips", "apex"],
    },
    {
      title: "Fortnite build fight breakdown",
      description: "Slowed-down look at a close build battle.",
      game: "Fortnite",
      tags: ["breakdown", "fortnite"],
    },
    {
      title: "New Challenges just dropped on Circuit",
      description: "This week's 1v1 Challenge lineup across every supported game.",
      game: null,
      tags: ["announcement"],
    },
    {
      title: "Efootball set-piece routine that keeps working",
      description: "A corner routine worth adding to your playbook.",
      game: "Efootball",
      tags: ["tips", "efootball"],
    },
    {
      title: "Inside a Circuit organiser's ranked run",
      description: "Community highlight from this month's ladder climb.",
      game: "Call of Duty",
      tags: ["community"],
    },
    {
      title: "Apex ranked: ring positioning for late game",
      description: "Where to sit before the final two rings close.",
      game: "Apex Legends",
      tags: ["tips", "apex"],
    },
    {
      title: "Circuit gaming tip: warm up like this before ranked",
      description: "A five-minute warm-up routine before you queue.",
      game: null,
      tags: ["tips", "gaming"],
    },
  ];

  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const base = slugify(r.title);
    const existing = await prisma.video.findUnique({ where: { slug: base } });
    const slug = existing ? `${base}-${Date.now().toString(36)}` : base;

    await prisma.video.create({
      data: {
        slug,
        source: "CIRCUIT",
        title: r.title,
        description: r.description,
        videoUrl: SAMPLE_FILES[i % SAMPLE_FILES.length],
        game: r.game,
        tournamentId: r.tournament?.id ?? null,
        tags: r.tags,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - i * 1000 * 60 * 60 * 6),
        likes: Math.floor(Math.random() * 40),
        views: Math.floor(Math.random() * 500) + 20,
        shares: Math.floor(Math.random() * 10),
      },
    });
    created += 1;
  }

  console.log(`Seeded ${created} videos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
