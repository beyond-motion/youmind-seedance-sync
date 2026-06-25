import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "aimikoda-seedance");
const MEDIA_DIR = path.join(OUT_DIR, "media");

const AWESOME_BASE = "https://awesomevideoprompts.com";
const AWESOME_SOURCE = "https://awesomevideoprompts.com/ja/models/seedance2/";

const EXTRA_RECORDS = [
  {
    id: "2044056761686990886",
    title: "Bullet Time Selfie Template",
    date: "2026-04-14",
    sourceUrl: "https://x.com/aimikoda/status/2044056761686990886",
    category: "Comedy / Bullet-time",
    tags: ["bullet-time", "selfie", "template", "continuous-shot", "comedy"],
    prompt: `Seedance 2.0 Parameter Based Prompts

I've been experimenting with variable-based prompting in Seedance 2.0 and built a modular template for these bullet-time selfie sequences.
The main video was made with a different prompt. I used it as a base to build this template. It won't always be perfect depending on the scene, but the parameter-based approach is still very usable.

Dropped a few examples in the replies, you just need to change the variables.

Prompt Template:

FORMAT: 15s / ONE CONTINUOUS SHOT / BULLET TIME SELFIE

PARAMS:
<CHARACTER>: define subject, outfit, state
<ENVIRONMENT>: define location, time, atmosphere
<UNEXPECTED_EVENT>: define threat / accident / impact
<OUTCOME_ACTION>: define reaction (attack / dodge / collision / escape)
<FINAL_STATE>: define ending state

RULE:
Freeze the world, keep only <CHARACTER> in real-time motion.
Delay character action inside slow motion (~2s hold before selfie).
Selfie must clearly include both <CHARACTER> and the <UNEXPECTED_EVENT> in the same frame.

STRUCTURE:

0.0–3.0s — SETUP
<CHARACTER> in <ENVIRONMENT>, normal flow.
<UNEXPECTED_EVENT> begins and escalates rapidly.

3.0–10.0s — PEAK (SLOW MOTION)

3.0–5.0s
Time slows almost to a freeze at the critical moment.
<CHARACTER> holds position, tension builds.

5.0–10.0s
[cam: close, slight orbit / bullet time]
[sfx: ambience stretch, single phone snap]

<CHARACTER> pulls out phone → takes selfie capturing the moment → puts it back.

10.0–13.0s — OUTCOME ACTION
Time snaps back instantly.

<OUTCOME_ACTION> plays out.

13.0–15.0s — END
<FINAL_STATE>.`,
    media: {
      image: "https://pbs.twimg.com/amplify_video_thumb/2044056012567523328/img/8m11vuFZH2mZHXed.jpg",
      video: "https://video.twimg.com/amplify_video/2044056012567523328/vid/avc1/2560x1440/toZHn0UkarJn1g8x.mp4",
    },
    notes: "Prompt text from public vxtwitter API; this also appears on a PicX template page.",
  },
  {
    id: "2044830615434854449",
    title: "Infinite Fight Scenes From One Prompt",
    date: "2026-04-16",
    sourceUrl: "https://x.com/aimikoda/status/2044830615434854449",
    category: "Action / Parametric combat",
    tags: ["fight", "template", "combat", "parametric", "action"],
    prompt: `Seedance 2.0 1080p

Infinite Fight Scenes From One Prompt

Created a parametric prompt for epic fight scenes. You can generate unlimited variations just by changing the parameters. Tested one generation in 1080p with Seedance 2.0 on Higgsfield.

Prompt Template:

FORMAT: 15s / continuous fight

CHARACTERS
A: [character_A]
B: [character_B]

ENVIRONMENT
[short description]

FIGHT PROFILE
STYLE: [brutal / elegant / tactical / chaotic / cinematic]
ENERGY: [low / medium / high / explosive]
WEAPONS: [none / melee / mixed]
INTENT: [duel / assassination / survival / dominance / training]

VISUAL
Cinematic realism, physical lighting, shallow DOF, subtle grain, natural motion blur.

DIRECTIVE
No fixed choreography. Fight emerges dynamically from characters, environment, and momentum.

BEHAVIOR
- Use environment freely (walls, ground, objects)
- Allow verticality (climb, wall-run, elevation shifts)
- Encourage unexpected but physically valid actions

RULES
- Momentum chain only, no isolated actions
- Clear positioning at all times
- Continuous, motivated camera (POV / OTS / wide / low-high as needed)
- Environment actively reacts`,
    media: {
      image: "https://pbs.twimg.com/amplify_video_thumb/2044829187370835968/img/lg-RjPLd7i2zL9bN.jpg",
      video: "https://video.twimg.com/amplify_video/2044829187370835968/vid/avc1/1920x1080/afn9k8ZMdpVD36li.mp4",
    },
    notes: "This is the quoted template tweet referenced by the multi-opponent variant.",
  },
  {
    id: "2044924236058255656",
    title: "Infinite Fight Scenes Variant: Multiple Opponents",
    date: "2026-04-16",
    sourceUrl: "https://x.com/aimikoda/status/2044924236058255656",
    category: "Action / Combat variants",
    tags: ["fight", "combat", "assassin", "multi-opponent", "action"],
    prompt: `This Seedance 2.0 parametric prompt also works with multiple opponents.

Used parameters:

CHARACTERS:
A: [ref_image] an assassin with a blade and fluid movement
B: armored guards with shields and coordinated attacks

ENVIRONMENT
dimly lit palace corridor with pillars and polished stone floor

FIGHT PROFILE
STYLE: elegant
ENERGY: high
WEAPONS: melee
INTENT: assassination`,
    media: {
      image: "https://pbs.twimg.com/amplify_video_thumb/2044923734323257344/img/OfBVqPs_d3E9v1J0.jpg",
      video: "https://video.twimg.com/amplify_video/2044923734323257344/vid/avc1/2206x946/TVSbnpu9235Sge5t.mp4",
    },
    notes: "Variant post that points back to the base fight template.",
  },
  {
    id: "2041712195591905398",
    title: "POV: Paragliding In The Wrong Era",
    date: "2026-04-08",
    sourceUrl: "https://x.com/aimikoda/status/2041712195591905398",
    category: "POV / Extreme adventure",
    tags: ["pov", "paragliding", "dinosaur", "adventure", "continuous-shot"],
    prompt: `VISUAL STYLE: Use live-action feature film realism with crisp action-camera sharpness and ancient atmospheric haze.

CHARACTERS:
Define a pair of gloved human hands gripping worn paraglider toggles, dark flying boots, and multiple massive prehistoric predators crossing the flight path.

STAGE:
Set a vast prehistoric canyon that drops from open sky into fern-choked treetops, a fast river corridor, and a muddy predator clearing under harsh daylight haze.

EMOTIONAL TARGET:
Build from reckless speed into unstoppable hunted panic.

COLOR LOGIC:
Naturalistic Film Print Emulation

TIMELINE:
00:00.0: Open on a strict POV suspended over the canyon lip. Use an ultra-wide 14mm action lens with locked forward flight. Drop hard toward the jungle canopy as both gloved hands pull the toggles down and the boots kick into empty air. SFX: Violent wind rush, harness straps snapping tight.

00:03.4: Keep the same locked POV and lens package. Dive between treetop crowns, skim past the swaying neck of a towering long-neck herbivore, and force the right hand to yank the toggle to miss its jawline by inches. SFX: Deep animal bellow, leaves tearing, rising wind scream.

00:06.8: Maintain the uninterrupted plunge. Thread into a narrow river corridor as a flock of pterosaurs erupts off the cliff wall and crosses directly through the flight path. Let the left hand snap the canopy into a hard bank while the boots clear wet rock by inches. SFX: Shrill wingbeats, river thunder, fabric strain.

00:10.2: Hold the same POV and keep driving forward. Blast out of the river bend into a muddy clearing, lose altitude fast, and drag the boot soles across churned earth as the canopy collapses behind the camera path. SFX: Skidding mud scrape, collapsing fabric whip, panicked breath.

00:12.8: Maintain the same first-person line at ground level. Stumble forward two desperate steps, look up, and let a charging Spinosaurus burst out of the river mist with its long jaws thrown wide straight at the lens until the teeth fill the frame. SFX: Ground-shaking footfalls, guttural bellow, snapping jaws.

EXCLUDE:
Avoid third-person camera breaks, disjointed hands, impossible flight resets, teleporting terrain, frozen creatures, modern gear drift, impossible neck rotation, cut language.`,
    media: {
      image: "https://pbs.twimg.com/amplify_video_thumb/2041711978142474240/img/ufEYoFhxPiUIvon1.jpg",
      video: "https://video.twimg.com/amplify_video/2041711978142474240/vid/avc1/1280x720/JDnzjvabs4PMK2HP.mp4",
    },
    notes: "Prompt text reconstructed from the public TwStalker status detail page.",
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function classify(record) {
  const text = `${record.title} ${record.tags.join(" ")}`.toLowerCase();
  if (text.includes("storyboard")) return "Storyboard / Adventure";
  if (text.includes("daily")) return "Lifestyle / Daily routine";
  if (text.includes("horror") || text.includes("streamer")) return "Horror / Gaming";
  if (text.includes("time-travel")) return "Time-travel / Transformation";
  if (text.includes("vfx") || text.includes("summoning")) return "VFX / Character reference";
  if (text.includes("fashion")) return "Fashion / Product";
  if (text.includes("camera-move") || text.includes("cinematography")) return "Cinematography / Camera moves";
  if (text.includes("gaming") || text.includes("fortnite")) return "Gaming / Combat";
  if (text.includes("comedy") || text.includes("bullet-time")) return "Comedy / Bullet-time";
  if (text.includes("fight") || text.includes("combat") || text.includes("assassin")) return "Action / Combat";
  if (text.includes("pov") || text.includes("paragliding")) return "POV / Extreme adventure";
  return "Misc / Seedance experiments";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function download(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(targetPath));
}

function extractAwesomePrompts(html) {
  const match = html.match(/<script type=application\/json id=prompts-data>(\[.*\])<\/script>/s);
  if (!match) {
    throw new Error("Could not find prompts-data JSON in awesomevideoprompts page");
  }
  const rows = JSON.parse(match[1]);
  return rows
    .filter((row) => String(row.author).toLowerCase() === "aimikoda")
    .map((row) => ({
      id: row.sourceUrl.match(/status\/(\d+)/)?.[1] ?? slugify(row.title),
      title: row.title,
      date: row.date,
      sourceUrl: row.sourceUrl,
      mirrorUrl: `${AWESOME_BASE}${row.permalink}`,
      category: classify(row),
      tags: row.tags,
      prompt: row.description.trim(),
      media: {
        image: row.image ? `${AWESOME_BASE}${row.image}` : null,
        video: row.video ? `${AWESOME_BASE}${row.video}` : null,
      },
      notes: "Prompt and preview media mirrored by awesomevideoprompts.com.",
    }));
}

function groupByCategory(records) {
  return records.reduce((acc, record) => {
    acc[record.category] ??= [];
    acc[record.category].push(record);
    return acc;
  }, {});
}

function buildReadme(records) {
  const grouped = groupByCategory(records);
  const lines = [
    "# Aimikoda Seedance 2.0 Prompt Collection",
    "",
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "This folder contains public Seedance 2.0 prompts attributed to `@aimikoda`, grouped and mirrored locally when preview media was publicly available.",
    "",
    "## Structure",
    "",
    "- `records.json`: normalized dataset",
    "- `media/`: downloaded cover images and videos",
    "",
    "## Categories",
    "",
  ];

  for (const [category, items] of Object.entries(grouped).sort()) {
    lines.push(`### ${category}`, "");
    for (const item of items.sort((a, b) => a.date.localeCompare(b.date))) {
      const files = [];
      if (item.localMedia?.image) files.push(path.basename(item.localMedia.image));
      if (item.localMedia?.video) files.push(path.basename(item.localMedia.video));
      lines.push(`- ${item.date} | ${item.title}`);
      lines.push(`  - Source: ${item.sourceUrl}`);
      lines.push(`  - Tags: ${item.tags.join(", ")}`);
      if (files.length) lines.push(`  - Local media: ${files.join(", ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function main() {
  await mkdir(MEDIA_DIR, { recursive: true });

  const awesomeHtml = await fetchText(AWESOME_SOURCE);
  const awesomeRecords = extractAwesomePrompts(awesomeHtml);
  const records = [...awesomeRecords, ...EXTRA_RECORDS].sort((a, b) => b.date.localeCompare(a.date));

  for (const record of records) {
    record.localMedia = {};
    const base = `${record.date}-${slugify(record.title)}`;
    if (record.media?.image) {
      const imageExt = path.extname(new URL(record.media.image).pathname) || ".jpg";
      const imagePath = path.join(MEDIA_DIR, `${base}${imageExt}`);
      await download(record.media.image, imagePath);
      record.localMedia.image = imagePath;
    }
    if (record.media?.video) {
      const videoExt = path.extname(new URL(record.media.video).pathname) || ".mp4";
      const videoPath = path.join(MEDIA_DIR, `${base}${videoExt}`);
      await download(record.media.video, videoPath);
      record.localMedia.video = videoPath;
    }
  }

  await writeFile(path.join(OUT_DIR, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
  await writeFile(path.join(OUT_DIR, "README.md"), buildReadme(records));

  console.log(`Saved ${records.length} records to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
