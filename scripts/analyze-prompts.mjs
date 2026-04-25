import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  DEFAULT_LOCALE,
  DEFAULT_MODEL,
  ROOT,
  SITE_DIR,
  ensureDirSync,
  writeJsonSync
} from "./lib/config.mjs";
import {
  GENRE_DEFINITIONS,
  RULES_PATH,
  TAG_DEFINITIONS,
  TERM_GROUPS,
  countTimeSegments
} from "./lib/prompt-insights.mjs";

const ANALYSIS_DIR = path.join(ROOT, "analysis");
const MARKDOWN_OUTPUT_PATH = path.join(ANALYSIS_DIR, "seedance-framework.md");
const JSON_OUTPUT_PATH = path.join(ANALYSIS_DIR, "prompt-analysis.json");

const SOURCE_CANDIDATES = [
  path.join(DATA_DIR, `prompts.${DEFAULT_LOCALE}.json`),
  path.join(SITE_DIR, "data", "prompts.json")
];

function parseCliOptions() {
  const args = new Set(process.argv.slice(2));

  return {
    stable: args.has("--stable") || process.env.YOUMIND_ANALYSIS_STABLE === "1"
  };
}

function getGeneratedAt(payload, stable) {
  if (!stable) {
    return new Date().toISOString();
  }

  return payload.fetchedAt || payload.generatedAt || "stable";
}

const RESEARCH_SOURCES = [
  {
    label: "ByteDance Seedance 2.0 官方模型页",
    url: "https://seed.bytedance.com/en/seedance2_0",
    note:
      "确认 Seedance 2.0 是统一多模态音视频联合生成架构，支持文本、图片、音频、视频输入，并强调表演、光影、阴影和镜头运动控制。"
  },
  {
    label: "ByteDance Seedance 2.0 官方发布博客",
    url: "https://seed.bytedance.com/en/blog/seedance-2-0-official-launch",
    note:
      "确认复杂动作/交互、物理规律、双声道音频、多轨背景音乐/环境音/角色配音、微表情、镜头运动和叙事节奏是核心能力，同时承认细节稳定、多主体一致性、文字渲染、复杂编辑和音频失真仍是风险点。"
  },
  {
    label: "Seedance 2.0 arXiv Model Card",
    url: "https://arxiv.org/abs/2604.14148",
    note:
      "确认 4-15 秒音视频直接生成、原生 480p/720p、当前开放平台最多支持 3 个视频、9 张图片、3 段音频作为多模态参考。"
  },
  {
    label: "Seedance 1.0 arXiv 技术报告",
    url: "https://arxiv.org/abs/2506.09113",
    note:
      "为 Seedance 系列的多镜头叙事、一致主体表示、提示遵循、运动合理性和时空流畅性提供背景。"
  },
  {
    label: "Google Veo 官方视频提示词指南",
    url: "https://ai.google.dev/gemini-api/docs/video",
    note:
      "把视频提示词拆为主体、动作、风格、镜头位置/运动、构图、焦点/镜头效果、氛围、时间元素和音频。"
  },
  {
    label: "Google Cloud Vertex AI Veo Prompt Guide",
    url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide",
    note:
      "提供更细的动作、场景、时间、音频、电影术语和负面提示维度，可转化为 Seedance 分析标签。"
  },
  {
    label: "OpenAI Sora 视频生成 API 文档",
    url: "https://developers.openai.com/api/docs/guides/video-generation",
    note:
      "确认视频提示的核心是 subjects、camera、lighting、motion；图片参考和角色复用用于一致性。"
  },
  {
    label: "OpenAI Sora 2 Prompting Guide",
    url: "https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide",
    note:
      "强调短提示给模型自由度，长提示适合锁定摄影、灯光、声音和时间；每个镜头最好有一个清晰镜头运动和一个主体动作。"
  },
  {
    label: "Runway Gen-4 Video Prompting Guide",
    url: "https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide",
    note:
      "强调把抽象意图翻译为可观察动作，图生视频时不要重复图片中已有视觉信息，而要描述运动。"
  },
  {
    label: "Runway Academy Prompting Guide",
    url: "https://academy.runwayml.com/guides/prompting-guide",
    note:
      "把视频提示拆成视觉组件和运动组件，视觉包括主体、环境、光线、构图、风格，运动包括主体动作、环境运动、镜头运动、时间、方向和速度。"
  }
];

function readPromptPayload() {
  for (const sourcePath of SOURCE_CANDIDATES) {
    if (fs.existsSync(sourcePath)) {
      const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      if (Array.isArray(payload.prompts)) {
        return { payload, sourcePath };
      }
    }
  }

  throw new Error(
    `No prompt payload found. Expected one of: ${SOURCE_CANDIDATES.join(", ")}`
  );
}

function normalizePrompt(prompt) {
  const sourcePrompt = prompt.content || prompt.prompt || "";
  const translatedPrompt = prompt.translatedContent || prompt.translatedPrompt || "";
  const text = translatedPrompt || sourcePrompt;
  const referenceImages = Array.isArray(prompt.referenceImages)
    ? prompt.referenceImages
    : Array.isArray(prompt.sourceReferenceImages)
      ? prompt.sourceReferenceImages
      : [];

  return {
    id: String(prompt.id ?? ""),
    title: prompt.title || "",
    description: prompt.description || "",
    language: prompt.language || "",
    featured: Boolean(prompt.featured),
    sourcePublishedAt: prompt.sourcePublishedAt || "",
    authorName: prompt.author?.name || prompt.authorName || "",
    sourcePrompt,
    translatedPrompt,
    text,
    combinedText: [prompt.title, prompt.description, text].filter(Boolean).join("\n"),
    genreText: [prompt.title, prompt.description].filter(Boolean).join("\n") || text,
    referenceImages,
    hasVideo: Boolean(prompt.videoUrl || prompt.playbackUrl || prompt.originalVideoUrl || prompt.videos?.length)
  };
}

function percent(count, total) {
  if (!total) {
    return "0.0%";
  }

  return `${((count / total) * 100).toFixed(1)}%`;
}

function quantile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const index = Math.floor((values.length - 1) * ratio);
  return values[index];
}

function countBy(items, getKey) {
  const counts = new Map();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function countMatches(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = /[a-z]/i.test(term) ? "gi" : "g";
  return [...text.matchAll(new RegExp(escaped, flags))].length;
}

function countTerms(prompts, terms) {
  const corpus = prompts.map((prompt) => prompt.combinedText).join("\n");
  return terms
    .map((term) => ({ term, count: countMatches(corpus, term) }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term));
}

function lengthBucket(length) {
  if (length < 80) {
    return "一句话灵感型 <80 字";
  }

  if (length < 200) {
    return "短提示 80-199 字";
  }

  if (length < 500) {
    return "标准提示 200-499 字";
  }

  if (length < 1000) {
    return "分镜提示 500-999 字";
  }

  return "生产级提示 >=1000 字";
}

function formatTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function topExamples(prompts, predicate, limit = 5) {
  return prompts
    .filter(predicate)
    .sort((left, right) => right.text.length - left.text.length)
    .slice(0, limit)
    .map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      length: prompt.text.length
    }));
}

function buildAnalysis(payload, sourcePath, { stable = false } = {}) {
  const prompts = payload.prompts.map(normalizePrompt);
  const total = prompts.length;
  const lengths = prompts.map((prompt) => prompt.text.length).sort((left, right) => left - right);
  const combinedPrompts = prompts.map((prompt) => ({
    ...prompt,
    tags: TAG_DEFINITIONS.filter((tag) => tag.pattern.test(prompt.combinedText)).map((tag) => tag.key),
    genres: GENRE_DEFINITIONS.filter((genre) => genre.pattern.test(prompt.genreText)).map(
      (genre) => genre.key
    ),
    timeSegmentCount: countTimeSegments(prompt.text)
  }));

  const tagCounts = TAG_DEFINITIONS.map((tag) => {
    const count = combinedPrompts.filter((prompt) => prompt.tags.includes(tag.key)).length;
    return {
      key: tag.key,
      label: tag.label,
      count,
      percent: percent(count, total)
    };
  }).sort((left, right) => right.count - left.count);

  const genreCounts = GENRE_DEFINITIONS.map((genre) => {
    const count = combinedPrompts.filter((prompt) => prompt.genres.includes(genre.key)).length;
    return {
      key: genre.key,
      label: genre.label,
      count,
      percent: percent(count, total)
    };
  })
    .filter((genre) => genre.count > 0)
    .sort((left, right) => right.count - left.count);

  const structuralBuckets = countBy(combinedPrompts, (prompt) => lengthBucket(prompt.text.length)).map(
    ([bucket, count]) => ({
      bucket,
      count,
      percent: percent(count, total)
    })
  );

  const tagLabelByKey = Object.fromEntries(TAG_DEFINITIONS.map((tag) => [tag.key, tag.label]));
  const genreLabelByKey = Object.fromEntries(GENRE_DEFINITIONS.map((genre) => [genre.key, genre.label]));

  return {
    generatedAt: getGeneratedAt(payload, stable),
    stable,
    sourcePath,
    rulesPath: RULES_PATH,
    source: {
      fetchedAt: payload.fetchedAt || payload.generatedAt || "",
      locale: payload.locale || DEFAULT_LOCALE,
      model: payload.model || DEFAULT_MODEL,
      total
    },
    corpus: {
      total,
      languages: countBy(combinedPrompts, (prompt) => prompt.language || "unknown").map(([key, count]) => ({
        key,
        count,
        percent: percent(count, total)
      })),
      featured: {
        count: combinedPrompts.filter((prompt) => prompt.featured).length,
        percent: percent(
          combinedPrompts.filter((prompt) => prompt.featured).length,
          total
        )
      },
      withTranslatedPrompt: {
        count: combinedPrompts.filter((prompt) => Boolean(prompt.translatedPrompt)).length,
        percent: percent(
          combinedPrompts.filter((prompt) => Boolean(prompt.translatedPrompt)).length,
          total
        )
      },
      withReferenceImages: {
        count: combinedPrompts.filter((prompt) => prompt.referenceImages.length > 0).length,
        percent: percent(
          combinedPrompts.filter((prompt) => prompt.referenceImages.length > 0).length,
          total
        )
      },
      withVideo: {
        count: combinedPrompts.filter((prompt) => prompt.hasVideo).length,
        percent: percent(
          combinedPrompts.filter((prompt) => prompt.hasVideo).length,
          total
        )
      },
      length: {
        min: lengths[0] || 0,
        p25: quantile(lengths, 0.25),
        p50: quantile(lengths, 0.5),
        p75: quantile(lengths, 0.75),
        p90: quantile(lengths, 0.9),
        max: lengths[lengths.length - 1] || 0
      }
    },
    tagCounts,
    genreCounts,
    structuralBuckets,
    terms: Object.fromEntries(
      Object.entries(TERM_GROUPS).map(([group, terms]) => [group, countTerms(combinedPrompts, terms)])
    ),
    examples: {
      featured: combinedPrompts
        .filter((prompt) => prompt.featured)
        .map((prompt) => ({ id: prompt.id, title: prompt.title, length: prompt.text.length })),
      productionBriefs: topExamples(combinedPrompts, (prompt) => prompt.text.length >= 1000),
      timecoded: topExamples(combinedPrompts, (prompt) => prompt.tags.includes("timecoded_segments")),
      referenceDriven: topExamples(
        combinedPrompts,
        (prompt) =>
          prompt.tags.includes("reference_image") ||
          prompt.tags.includes("reference_video") ||
          prompt.tags.includes("reference_audio")
      ),
      audioDriven: topExamples(combinedPrompts, (prompt) => prompt.tags.includes("audio")),
      oneTake: topExamples(combinedPrompts, (prompt) => prompt.tags.includes("one_take"))
    },
    promptMap: combinedPrompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      length: prompt.text.length,
      tags: prompt.tags.map((tag) => tagLabelByKey[tag]),
      genres: prompt.genres.map((genre) => genreLabelByKey[genre]),
      timeSegmentCount: prompt.timeSegmentCount
    }))
  };
}

function buildMarkdown(analysis) {
  const sourcePathRelative = path.relative(ROOT, analysis.sourcePath);
  const rulesPathRelative = path.relative(ROOT, analysis.rulesPath);
  const topTagRows = analysis.tagCounts.map((tag) => [
    tag.label,
    String(tag.count),
    tag.percent
  ]);
  const genreRows = analysis.genreCounts.slice(0, 12).map((genre) => [
    genre.label,
    String(genre.count),
    genre.percent
  ]);
  const bucketRows = analysis.structuralBuckets.map((bucket) => [
    bucket.bucket,
    String(bucket.count),
    bucket.percent
  ]);
  const languageRows = analysis.corpus.languages.map((language) => [
    language.key,
    String(language.count),
    language.percent
  ]);

  const sourceLines = RESEARCH_SOURCES.map(
    (source, index) => `${index + 1}. [${source.label}](${source.url})：${source.note}`
  ).join("\n");

  const termSection = Object.entries(analysis.terms)
    .map(([group, terms]) => {
      const labelMap = {
        camera: "镜头词",
        style: "风格词",
        audio: "音频词",
        constraints: "约束词"
      };
      const values = terms
        .slice(0, 15)
        .map((item) => `${item.term} (${item.count})`)
        .join("、");
      return `- ${labelMap[group] || group}：${values || "暂无"}`;
    })
    .join("\n");

  const examplesSection = Object.entries(analysis.examples)
    .map(([key, examples]) => {
      const labelMap = {
        featured: "精选提示词",
        productionBriefs: "生产级长提示",
        timecoded: "时间分镜提示",
        referenceDriven: "多模态参考提示",
        audioDriven: "音频/声音提示",
        oneTake: "一镜到底提示"
      };
      const lines = examples.length
        ? examples
            .map((example) => `- #${example.id} ${example.title}（${example.length} 字）`)
            .join("\n")
        : "- 暂无";
      return `### ${labelMap[key] || key}\n\n${lines}`;
    })
    .join("\n\n");

  return `# Seedance 2.0 提示词框架调研与语料分析

生成时间：${analysis.generatedAt}

数据源：\`${sourcePathRelative}\`

分析规则：\`${rulesPathRelative}\`

模型/语言：${analysis.source.model} / ${analysis.source.locale}

样本量：${analysis.corpus.total} 条

## 1. 调研资料

${sourceLines}

## 2. 调研结论

1. Seedance 2.0 应按“多模态导演系统”来提示，而不是只按传统文生视频文本框来提示。文本负责意图、动作和导演指令，图片/视频/音频参考负责角色、构图、运动节奏、声音质感和连续性锚定。
2. 官方资料反复强调复杂动作、真实物理、微表情、镜头运动、叙事节奏和音画同步。因此框架必须覆盖“动作如何发生”“镜头如何看见”“声音如何同步”，不能只写画面风格。
3. 4-15 秒的短视频约束决定了提示词要有层级：短提示用于探索方向，标准提示用于单场景生成，生产级提示用于 15 秒内的 2-4 个清晰镜头或动作节拍。
4. 图生视频/参考驱动时，外部指南都建议少重复图片已有信息，多描述运动、变化和时序。Seedance 本地样本中的 @Image / 参考图提示也主要围绕“保持主体一致”和“让参考主体执行动作”展开。
5. 音频不是附属项。Seedance 2.0 的官方能力包括背景音乐、环境音、音效、角色配音和双声道同步，所以提示词框架应把声音独立成模块。
6. 仍需防御模型弱点：多主体一致性、细节稳定、文字渲染、复杂编辑、偶发音频失真。因此生成型框架里要保留“身份锁定”和“可验证约束”，但负面约束应尽量简短。

## 3. 本地语料概览

${formatTable(["语言", "数量", "占比"], languageRows)}

- 精选提示词：${analysis.corpus.featured.count} 条（${analysis.corpus.featured.percent}）
- 有中文译文：${analysis.corpus.withTranslatedPrompt.count} 条（${analysis.corpus.withTranslatedPrompt.percent}）
- 有参考图字段：${analysis.corpus.withReferenceImages.count} 条（${analysis.corpus.withReferenceImages.percent}）
- 有视频字段：${analysis.corpus.withVideo.count} 条（${analysis.corpus.withVideo.percent}）
- 长度分布：min ${analysis.corpus.length.min} / p25 ${analysis.corpus.length.p25} / p50 ${analysis.corpus.length.p50} / p75 ${analysis.corpus.length.p75} / p90 ${analysis.corpus.length.p90} / max ${analysis.corpus.length.max}

## 4. 结构信号统计

${formatTable(["模块", "数量", "占比"], topTagRows)}

## 5. 类型分布

${formatTable(["类型", "数量", "占比"], genreRows)}

## 6. 提示词长度层级

${formatTable(["层级", "数量", "占比"], bucketRows)}

## 7. 高频词汇积木

${termSection}

## 8. Seedance Prompt Stack

### A. 创意内核

一句话说明视频类型、时长、画幅、核心看点。

示例结构：\`15 秒，16:9 横屏，电影感动作短片，核心看点是赛博朋克女主在雨夜天桥完成一次高速追逐与反击。\`

### B. 输入与参考

说明当前是纯文本、图生视频、视频续写、参考图/视频/音频联合控制。参考素材要标明用途：角色外观、场景背景、运动节奏、镜头语言、声音质感。

示例结构：\`以 @Image1 作为女主外观参考，以 @Video1 的镜头节奏作为追逐参考，文本只描述新动作与结尾。\`

### C. 风格与媒介

指定视觉系统，而不是堆砌泛词。优先组合“媒介 + 类型 + 质感 + 调色”。

示例结构：\`35mm 手持胶片，雨夜犯罪片，高反差青绿色调，湿润霓虹反射，轻微胶片颗粒。\`

### D. 主体锁定

描述主体身份、外观、服装、表情和需要保持一致的要素。多角色要用位置或名称区分，避免同类主体互相串扰。

示例结构：\`女主始终保持银色短发、黑色机车夹克、右脸细小伤疤和冷静表情；服装、脸型、发型不漂移。\`

### E. 场景世界

写清地点、时间、天气、空间结构、可运动的环境元素和氛围锚点。

示例结构：\`雨夜重庆立交桥下，湿滑柏油、远处车流、霓虹广告牌倒映在积水中，低雾贴地流动。\`

### F. 镜头语言

每个镜头只给一个主要镜头运动。常用字段：景别、机位、镜头运动、焦点、速度、剪辑方式。

示例结构：\`低角度跟拍，镜头向后快速移动，保持女主面部清晰，背景形成运动模糊。\`

### G. 动作与物理

动作要可观察、可分解、有节拍。重要物理细节单独写：重量、惯性、布料、头发、水花、火焰、粒子、撞击反馈。

示例结构：\`她三步加速跨过护栏，落地时膝盖缓冲，雨水从靴底向外溅开，夹克下摆因惯性向前甩动。\`

### H. 时间分镜

适合 10-15 秒复杂片段。建议 2-4 段，不建议每 0.1 秒塞入过多变化，除非目标就是极速蒙太奇。

示例结构：

\`\`\`text
0-4 秒：建立场景与主体，低角度跟拍，女主冲入画面。
4-9 秒：动作升级，镜头环绕半圈，敌人从侧后方逼近。
9-15 秒：高潮反击，慢动作定格关键碰撞，最后切到面部特写。
\`\`\`

### I. 音频设计

单独描述环境音、音效、音乐、对白/歌词和口型同步。对白要短，角色名称稳定。

示例结构：\`音频：雨声与远处车流作为底噪，脚步踩水声清晰，低频鼓点逐渐加速；女主只在最后低声说：“现在轮到我了。”\`

### J. 约束与验收

只写真正影响成片的约束。优先正向描述，负面约束保持短句。

示例结构：\`保持主体身份一致；画面无字幕、无水印、无 Logo；避免脸部变形、肢体异常和服装漂移。\`

## 9. 可复用模板

### 9.1 最小可用模板

\`\`\`text
{时长}，{画幅}，{视频类型}。{主体} 在 {场景} 中 {核心动作}。{镜头运动/景别}，{风格/光影/色调}，{氛围}。
\`\`\`

### 9.2 标准单场景模板

\`\`\`text
[目标]
{时长} {画幅}，{视频类型}，核心看点是 {一句话创意}。

[风格]
{视觉风格}，{摄影/渲染质感}，{色调}，{光影}，{氛围}。

[主体]
{人物/物体描述}，{服装/外观/状态}，保持 {身份/脸部/服装/比例} 一致。

[场景]
{地点}，{时间}，{天气/环境}，{关键空间细节}。

[动作与镜头]
{景别/机位}，{镜头运动}，{主体动作}，{环境运动/物理细节}。

[声音]
{环境音}，{BGM/音效/对白}。

[约束]
无字幕、无水印、无 Logo；避免脸部变形、肢体异常、服装漂移。
\`\`\`

### 9.3 15 秒分镜模板

\`\`\`text
[目标]
15 秒，{画幅}，{类型}，核心看点：{冲突/转变/视觉奇观}。

[全局设定]
风格：{风格}。
主体：{主体锁定}。
场景：{场景锁定}。
声音：{整体音频方向}。

[分镜]
0-5 秒：{建立镜头}。画面：{画面内容}。动作：{动作}。细节：{物理/表情/环境}。
5-10 秒：{升级镜头}。画面：{画面内容}。动作：{动作}。细节：{物理/表情/环境}。
10-15 秒：{高潮镜头}。画面：{画面内容}。动作：{动作}。细节：{结尾余韵}。

[约束]
{一致性锁定}；无文字、字幕、水印、Logo。
\`\`\`

### 9.4 图生视频/参考驱动模板

\`\`\`text
以 @Image1 作为 {主体/场景/风格} 参考，保持其中的 {脸部/服装/构图/色调} 一致。
不要重复描述图片里已经明确的静态信息，重点生成以下运动：
{主体动作}，{环境运动}，{镜头运动}，持续 {时长}。
声音：{音效/BGM/对白}。
约束：{身份一致性与禁止项}。
\`\`\`

### 9.5 音画同步模板

\`\`\`text
{时长}，{画幅}，{场景与主体}。
视觉节奏：{动作节拍/镜头节拍}。
音频：{BGM 类型与速度}，{环境音}，{关键音效}。
对白/歌词：{角色 A}: "{短句}"；{角色 B}: "{短句}"。
口型自然同步，说话时嘴部轻微运动，停顿符合 {情绪/节奏}。
\`\`\`

## 10. 样本索引

${examplesSection}

## 11. 实战工作流

1. 先用最小模板生成 2-3 个方向，确认风格和主体是否可行。
2. 选中方向后补“主体锁定 + 场景世界 + 镜头语言”，避免一开始写成长脚本。
3. 如果需要角色连续性，优先准备参考图/首帧；文本只负责动作和镜头，不重复图片静态细节。
4. 复杂 15 秒片段拆成 3 个 5 秒镜头，每段只安排一个主动作和一个主镜头运动。
5. 有对白或 MV 时，先规划音频节拍，再写动作和口型；长台词容易破坏同步。
6. 最后加少量约束并做验收：主体一致、动作可读、镜头不乱、光影统一、音画同步、无不需要的文字。
`;
}

async function main() {
  const options = parseCliOptions();
  const { payload, sourcePath } = readPromptPayload();
  const analysis = buildAnalysis(payload, sourcePath, options);
  const markdown = buildMarkdown(analysis);

  ensureDirSync(ANALYSIS_DIR);
  writeJsonSync(JSON_OUTPUT_PATH, analysis);
  fs.writeFileSync(MARKDOWN_OUTPUT_PATH, markdown, "utf8");

  console.log(`Analysis JSON written to ${JSON_OUTPUT_PATH}`);
  console.log(`Framework Markdown written to ${MARKDOWN_OUTPUT_PATH}`);
  console.log(
    `Analyzed ${analysis.corpus.total} prompts from ${sourcePath}${options.stable ? " (stable output)" : ""}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
