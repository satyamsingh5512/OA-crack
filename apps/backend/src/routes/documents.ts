import type { FastifyInstance } from 'fastify';
import {
  generatedQuestionsQuerySchema, jobDescriptionSchema, paginationSchema, resumeUploadSchema,
} from '@ai-assistant/shared';
import { extractDocumentText } from '../resume/extract.js';
import { generateQuestionsFromContext, matchSkills, parseJobDescriptionText, parseResumeText } from '../resume/parse.js';
import { audit, badRequest, clientIp, notFound, parseInput, repo, requireUser } from '../http/helpers.js';

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  /** Accepts either multipart (PDF/DOCX/TXT/MD file) or JSON `{ filename, text }`. */
  app.post('/resume/upload', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();

    let filename = 'resume.txt';
    let text: string;
    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });
      filename = file.filename || filename;
      const buffer = await file.toBuffer();
      try {
        text = await extractDocumentText(buffer, filename, file.mimetype);
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not read the document' });
      }
    } else {
      const parsed = parseInput(resumeUploadSchema, req.body);
      if (!parsed.ok) return badRequest(reply, parsed.issues);
      filename = parsed.data.filename;
      text = parsed.data.text;
    }

    const resume = await db.createResume({ userId, filename, content: text, parsed: parseResumeText(text) });
    await audit(db, userId, 'resume.upload', resume.id, clientIp(req));
    return {
      resume: { id: resume.id, filename: resume.filename, parsed: resume.parsed, uploadedAt: resume.uploadedAt },
    };
  });

  app.get('/resume', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(paginationSchema, req.query ?? {});
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const resumes = await db.listResumes(userId);
    return {
      resumes: resumes
        .slice(parsed.data.offset, parsed.data.offset + parsed.data.limit)
        .map((r) => ({ id: r.id, filename: r.filename, parsed: r.parsed, uploadedAt: r.uploadedAt })),
      total: resumes.length,
    };
  });

  app.get('/resume/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const resume = await db.getResume((req.params as { id: string }).id);
    if (!resume || resume.userId !== userId) return notFound(reply, 'Resume');
    return { resume };
  });

  app.delete('/resume/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const resume = await db.getResume(id);
    if (!resume || resume.userId !== userId) return notFound(reply, 'Resume');
    await db.deleteResume(id);
    await audit(db, userId, 'resume.delete', id, clientIp(req));
    return { ok: true };
  });

  /** §12: Required Skill → User Evidence → Confidence → Potential Question. */
  app.get('/resume/:id/match', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const resume = await db.getResume(id);
    if (!resume || resume.userId !== userId) return notFound(reply, 'Resume');
    const jdId = (req.query as { jobDescriptionId?: string }).jobDescriptionId;
    if (!jdId) return reply.code(400).send({ error: 'jobDescriptionId query parameter is required' });
    const jd = await db.getJobDescription(jdId);
    if (!jd || jd.userId !== userId) return notFound(reply, 'Job description');
    return { resumeId: resume.id, jobDescriptionId: jd.id, matches: matchSkills(resume.parsed, jd.parsed) };
  });

  app.get('/resume/:id/questions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(generatedQuestionsQuerySchema, req.query ?? {});
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const resume = await db.getResume(id);
    if (!resume || resume.userId !== userId) return notFound(reply, 'Resume');
    let jd = null;
    if (parsed.data.jobDescriptionId) {
      const found = await db.getJobDescription(parsed.data.jobDescriptionId);
      if (!found || found.userId !== userId) return notFound(reply, 'Job description');
      jd = found.parsed;
    }
    return { questions: generateQuestionsFromContext(resume.parsed, jd, parsed.data.count) };
  });

  app.post('/job-descriptions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(jobDescriptionSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const jd = await db.createJobDescription({
      userId,
      title: parsed.data.title,
      content: parsed.data.content,
      parsed: parseJobDescriptionText(parsed.data.title, parsed.data.content),
    });
    await audit(db, userId, 'job_description.create', jd.id, clientIp(req));
    return { jobDescription: jd };
  });

  app.get('/job-descriptions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    return { jobDescriptions: await db.listJobDescriptions(userId) };
  });

  app.get('/job-descriptions/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const jd = await db.getJobDescription((req.params as { id: string }).id);
    if (!jd || jd.userId !== userId) return notFound(reply, 'Job description');
    return { jobDescription: jd };
  });

  app.delete('/job-descriptions/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const jd = await db.getJobDescription(id);
    if (!jd || jd.userId !== userId) return notFound(reply, 'Job description');
    await db.deleteJobDescription(id);
    await audit(db, userId, 'job_description.delete', id, clientIp(req));
    return { ok: true };
  });
}