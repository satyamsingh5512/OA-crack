import { describe, expect, it } from 'vitest';
import { parseResumeText, parseJobDescriptionText, matchSkills, generateQuestionsFromContext } from '../src/resume/parse.js';
import { extractDocumentText } from '../src/resume/extract.js';

process.env.NODE_ENV = 'test';

const resumeText = [
  'Skills',
  'TypeScript, React, Node.js, PostgreSQL, Docker',
  'Experience',
  'Backend Engineer at Acme 2020-2023',
  'Built a notification platform with TypeScript and PostgreSQL that serves 10M users.',
  'Projects',
  'Notification Platform — distributed fan-out over Redis queues',
  'Education',
  'B.Sc. Computer Science',
  'https://github.com/example',
].join('\n');

describe('resume / job description parsing', () => {
  it('parses sections, matches skills and generates questions', () => {
    const resume = parseResumeText(resumeText);
    expect(resume.skills).toContain('TypeScript');
    expect(resume.technologies).toContain('Docker');
    expect(resume.experience[0]).toMatchObject({ title: 'Backend Engineer', company: 'Acme' });
    expect(resume.projects).toHaveLength(1);

    const jd = parseJobDescriptionText('Senior Backend Engineer', [
      'Build distributed notification systems.',
      'Requirements: TypeScript, Kubernetes, Kafka',
    ].join('\n'));
    expect(jd.skills).toContain('TypeScript');
    expect(jd.seniority).toBe('senior');

    const matches = matchSkills(resume, jd);
    expect(matches.find((m) => m.requiredSkill === 'TypeScript')?.confidence).toBe('high');
    expect(matches.find((m) => m.requiredSkill === 'Kubernetes')?.confidence).toBe('low');

    const questions = generateQuestionsFromContext(resume, jd, 6);
    expect(questions).toHaveLength(6);
    expect(questions[0].source).toBe('resume');

    const solo = generateQuestionsFromContext(resume, null, 10);
    expect(solo.length).toBeGreaterThan(0);
    expect(solo.every((q) => q.source !== 'job_description')).toBe(true);
  });

  it('extracts plain text documents and reads PDFs', async () => {
    const txt = await extractDocumentText(Buffer.from(resumeText, 'utf8'), 'resume.txt');
    expect(txt).toContain('Backend Engineer');

    const minimalPdf = [
      '%PDF-1.4', '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      '4 0 obj << /Length 68 >> stream', 'BT /F1 14 Tf 20 150 Td (Hello Resume Parser) Tj ET', 'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'trailer << /Root 1 0 R >>', '%%EOF',
    ].join('\n');
    const pdfText = await extractDocumentText(Buffer.from(minimalPdf, 'utf8'), 'resume.pdf');
    expect(pdfText).toContain('Hello Resume Parser');

    await expect(extractDocumentText(Buffer.from('x'), 'resume.png')).rejects.toThrow(/Unsupported file type/);
  });
});