import {
  EMPTY_JOB_DESCRIPTION, EMPTY_RESUME,
  type GeneratedQuestion, type MatchConfidence, type ParsedJobDescription, type ParsedResume,
  type QuestionCategory, type ResumeExperience, type SkillMatch,
} from '@ai-assistant/shared';

/** Canonical vocabulary used for skill extraction, matching and question generation. */
export const TECH_VOCABULARY: string[] = [
  'TypeScript', 'JavaScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'Scala',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Node.js', 'Express', 'NestJS', 'Fastify', 'Spring Boot', 'Django',
  'Flask', 'FastAPI', 'Rails', '.NET', 'GraphQL', 'REST', 'gRPC', 'WebSocket', 'HTML', 'CSS', 'Tailwind CSS',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'SQLite', 'Kafka', 'RabbitMQ',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'CI/CD',
  'Prometheus', 'Grafana', 'Datadog', 'OpenTelemetry', 'Jest', 'Vitest', 'Playwright', 'Cypress', 'JUnit',
  'Prisma', 'Drizzle', 'Hibernate', 'Microservices', 'System Design', 'Distributed Systems', 'Event-Driven',
  'Machine Learning', 'PyTorch', 'TensorFlow', 'LangChain', 'OAuth', 'JWT', 'WebRTC', 'WASAPI', 'Electron',
];

const SECTION_PATTERNS: { key: 'skills' | 'experience' | 'education' | 'projects'; pattern: RegExp }[] = [
  { key: 'skills', pattern: /^(technical\s+)?(skills|technologies|core competencies|tech stack)\b/i },
  { key: 'experience', pattern: /^(work\s+|professional\s+|relevant\s+)?(experience|employment|work history)\b/i },
  { key: 'education', pattern: /^(education|academics|qualifications)\b/i },
  { key: 'projects', pattern: /^(selected\s+|key\s+|side\s+|personal\s+)?projects\b/i },
];

const ROLE_WORDS = /\b(engineer|developer|manager|architect|analyst|consultant|intern|lead|scientist|designer|administrator|director)\b/i;
const YEAR_RANGE = /\b(19|20)\d{2}\s*(-|–|to)\s*((19|20)\d{2}|present|current)\b/i;
const BULLET = /^[-*•·–]\s*/;

type Sections = Record<'skills' | 'experience' | 'education' | 'projects' | 'other', string[]>;

export function splitResumeSections(lines: string[]): Sections {
  const sections: Sections = { skills: [], experience: [], education: [], projects: [], other: [] };
  let current: keyof Sections = 'other';
  for (const line of lines) {
    const heading = SECTION_PATTERNS.find((s) => s.pattern.test(line.replace(BULLET, '')));
    if (heading) { current = heading.key; continue; }
    sections[current].push(line);
  }
  return sections;
}

export function vocabularyHits(text: string): string[] {
  const lower = text.toLowerCase();
  return TECH_VOCABULARY.filter((term) => lower.includes(term.toLowerCase()));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** Heuristic resume parsing: skills, technologies, experience, projects, education, links. */
export function parseResumeText(text: string): ParsedResume {
  if (text.trim().length === 0) return { ...EMPTY_RESUME };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sections = splitResumeSections(lines);
  const vocabulary = vocabularyHits(text);

  const listedSkills = dedupe(
    sections.skills
      .flatMap((line) => line.replace(BULLET, '').split(/[,|;•·]/))
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 40),
  );

  const links = dedupe([
    ...[...text.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]),
    ...[...text.matchAll(/\b(?:www\.)?(?:github|linkedin)\.com\/[^\s,)]+/gi)].map((m) => m[0]),
  ]);

  const projects = dedupe(
    (sections.projects.length > 0 ? sections.projects : lines.filter((l) => /project/i.test(l)))
      .map((l) => l.replace(BULLET, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, 12),
  );

  return {
    skills: dedupe([...listedSkills, ...vocabulary]).slice(0, 60),
    technologies: vocabulary.slice(0, 60),
    projects,
    experience: parseExperience(sections.experience),
    education: dedupe(sections.education.map((l) => l.replace(BULLET, '').trim()).filter((l) => l.length > 2)).slice(0, 8),
    links: links.slice(0, 10),
  };
}

function parseExperience(lines: string[]): ResumeExperience[] {
  const entries: ResumeExperience[] = [];
  let current: ResumeExperience | null = null;
  for (const raw of lines) {
    const line = raw.replace(BULLET, '').trim();
    if (line.length === 0) continue;
    const looksLikeHeader = (YEAR_RANGE.test(line) || ROLE_WORDS.test(line)) && line.length <= 120;
    if (looksLikeHeader) {
      const period = line.match(YEAR_RANGE)?.[0] ?? '';
      const withoutPeriod = line.replace(YEAR_RANGE, '').replace(/[|,·–-]\s*$/, '').trim();
      const [title, company] = withoutPeriod.split(/\s+(?:at|@|,|\|)\s+/);
      current = {
        title: (title ?? withoutPeriod).trim().slice(0, 120),
        company: (company ?? '').trim().slice(0, 120),
        period,
        summary: '',
      };
      entries.push(current);
      continue;
    }
    if (current) current.summary = `${current.summary} ${line}`.trim().slice(0, 600);
  }
  return entries.slice(0, 10);
}

const SENIORITY_RULES: { level: string; pattern: RegExp }[] = [
  { level: 'intern', pattern: /\bintern(ship)?\b/i },
  { level: 'junior', pattern: /\b(junior|entry[- ]level|graduate|0-2 years)\b/i },
  { level: 'lead', pattern: /\b(lead|staff|principal|head of|architect)\b/i },
  { level: 'senior', pattern: /\b(senior|sr\.?|5\+ years)\b/i },
];

/** Heuristic job-description parsing: required skills, responsibilities, seniority. */
export function parseJobDescriptionText(title: string, content: string): ParsedJobDescription {
  if (content.trim().length === 0) return { ...EMPTY_JOB_DESCRIPTION, title };
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const vocabulary = vocabularyHits(content);

  const requirementBlock = lines
    .filter((l) => /^(requirements?|must[- ]have|qualifications|what you.{0,12}ll need|skills)/i.test(l.replace(BULLET, '')))
    .join(' ');
  const listedSkills = dedupe(
    requirementBlock
      .split(/[,;|•·]/)
      .map((s) => s.replace(/^[^:]*:\s*/, '').trim())
      .filter((s) => s.length >= 2 && s.length <= 40),
  );

  const responsibilities = dedupe(
    lines
      .map((l) => l.replace(BULLET, '').trim())
      .filter((l) => /^(build|design|develop|lead|own|drive|collaborate|implement|maintain|improve|deliver|partner|mentor|scale|create|write|support|manage|analy[sz]e)\b/i.test(l))
      .map((l) => l.slice(0, 300)),
  ).slice(0, 12);

  const seniority = SENIORITY_RULES.find((r) => r.pattern.test(`${title} ${content}`))?.level ?? null;

  return {
    title,
    skills: dedupe([...listedSkills, ...vocabulary]).slice(0, 60),
    responsibilities,
    seniority,
  };
}

const CODING_SKILLS = /\b(typescript|javascript|python|java|c\+\+|c#|go|rust|ruby|kotlin|swift|scala|php)\b/i;
const DATA_SKILLS = /\b(postgres|mysql|mongo|redis|elastic|dynamo|sqlite|sql|prisma|drizzle|hibernate|kafka|rabbitmq)\b/i;
const DESIGN_SKILLS = /\b(docker|kubernetes|terraform|aws|azure|gcp|microservices|distributed|system design|event-driven|ci\/cd)\b/i;

function categoryForSkill(skill: string): QuestionCategory {
  if (CODING_SKILLS.test(skill)) return 'coding';
  if (DATA_SKILLS.test(skill)) return 'database';
  if (DESIGN_SKILLS.test(skill)) return 'system_design';
  return 'technical';
}

/**
 * Required-skill → user-evidence matching (§12).
 * Evidence is always traceable to parsed resume data so the user can verify it.
 */
export function matchSkills(resume: ParsedResume, jd: ParsedJobDescription): SkillMatch[] {
  const resumeBlob = [
    resume.skills.join(' '),
    resume.projects.join(' '),
    resume.experience.map((e) => `${e.title} ${e.company} ${e.summary}`).join(' '),
  ].join(' ').toLowerCase();

  return jd.skills.slice(0, 25).map((skill) => {
    const key = skill.toLowerCase();
    const evidence: string[] = [];
    if (resume.skills.some((s) => s.toLowerCase() === key)) evidence.push(`Listed in skills: ${skill}`);
    for (const exp of resume.experience) {
      if (`${exp.title} ${exp.summary}`.toLowerCase().includes(key)) {
        evidence.push(exp.company ? `${exp.title} at ${exp.company}` : exp.title);
        break;
      }
    }
    const project = resume.projects.find((p) => p.toLowerCase().includes(key));
    if (project) evidence.push(`Project: ${project.slice(0, 80)}`);

    let confidence: MatchConfidence = 'low';
    if (evidence.length >= 2) confidence = 'high';
    else if (evidence.length === 1) confidence = 'medium';
    else if (resumeBlob.includes(key)) confidence = 'medium';

    const question = confidence === 'low'
      ? `This role requires ${skill} and it is not on your resume — how would you get productive with it in the first month?`
      : `Walk me through a specific problem you solved with ${skill}${evidence.length > 0 ? ` (${evidence[0]})` : ''}, including the tradeoff you chose.`;

    return {
      requiredSkill: skill,
      userEvidence: evidence.length > 0 ? evidence.join('; ') : 'No matching evidence found on the resume',
      confidence,
      potentialQuestion: question,
    };
  });
}

/** Generates a mixed question set from resume + JD context (§12). */
export function generateQuestionsFromContext(
  resume: ParsedResume,
  jd: ParsedJobDescription | null,
  count = 10,
): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  const push = (q: GeneratedQuestion): void => {
    if (out.length < count && !out.some((x) => x.question === q.question)) out.push(q);
  };

  for (const exp of resume.experience.slice(0, 3)) {
    push({
      question: `You were ${exp.title}${exp.company ? ` at ${exp.company}` : ''}${exp.period ? ` (${exp.period})` : ''}. What were you responsible for, and what changed because of your work?`,
      category: 'resume',
      rationale: `Resume experience: ${exp.title}${exp.company ? ` @ ${exp.company}` : ''}`,
      source: 'resume',
    });
  }

  for (const project of resume.projects.slice(0, 4)) {
    push({
      question: `Tell me about "${project.slice(0, 70)}" — what was the hardest technical decision and how did you make it?`,
      category: 'project',
      rationale: 'Resume project',
      source: 'resume',
    });
  }

  for (const skill of resume.technologies.slice(0, 5)) {
    push({
      question: `Your resume lists ${skill}. Describe a production issue you debugged with it and how you found the root cause.`,
      category: categoryForSkill(skill),
      rationale: `Resume technology: ${skill}`,
      source: resume.projects.length > 0 ? 'combined' : 'resume',
    });
  }

  if (jd) {
    for (const match of matchSkills(resume, jd).slice(0, 6)) {
      push({
        question: match.potentialQuestion,
        category: categoryForSkill(match.requiredSkill),
        rationale: `Job requirement: ${match.requiredSkill} (${match.confidence} confidence match)`,
        source: 'combined',
      });
    }
    for (const responsibility of jd.responsibilities.slice(0, 4)) {
      push({
        question: `This role expects you to ${responsibility.replace(/^[A-Z]/, (c) => c.toLowerCase()).slice(0, 120)}. How would you approach that in your first 90 days?`,
        category: 'other',
        rationale: 'Job description responsibility',
        source: 'job_description',
      });
    }
  }

  if (out.length === 0) {
    push({
      question: 'Walk me through the most technically challenging project on your resume, end to end.',
      category: 'technical',
      rationale: 'Fallback prompt — add a resume or job description for tailored questions',
      source: 'resume',
    });
  }
  return out.slice(0, count);
}