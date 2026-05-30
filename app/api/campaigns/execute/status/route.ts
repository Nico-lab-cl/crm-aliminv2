import { NextResponse } from 'next/server';
import { getJob, getAllJobs, cancelJob } from '@/lib/batch_engine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  // If no jobId, return all jobs
  if (!jobId) {
    const jobs = getAllJobs();
    return NextResponse.json(jobs.map(j => ({
      id: j.id,
      campaignId: j.campaignId,
      status: j.status,
      totalLeads: j.totalLeads,
      processedLeads: j.processedLeads,
      failedLeads: j.failedLeads,
      skippedLeads: j.skippedLeads,
      sentBatches: j.sentBatches,
      totalBatches: j.totalBatches,
      batchSize: j.batchSize,
      delayMs: j.delayMs,
      dailyLimit: j.dailyLimit,
      dailyUsedBefore: j.dailyUsedBefore,
      dailyRemaining: j.dailyRemaining,
      currentBatchIndex: j.currentBatchIndex,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      progress: j.totalLeads > 0 ? Math.round((j.processedLeads / Math.min(j.totalLeads, j.dailyRemaining)) * 100) : 0,
      errors: j.errors.slice(-5),
    })));
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ message: 'Job no encontrado' }, { status: 404 });
  }

  // Progress is based on leads that WILL be sent (not skipped ones)
  const leadsToProcess = Math.min(job.totalLeads, job.dailyRemaining);
  const progress = leadsToProcess > 0 ? Math.round((job.processedLeads / leadsToProcess) * 100) : 0;

  return NextResponse.json({
    id: job.id,
    campaignId: job.campaignId,
    status: job.status,
    totalLeads: job.totalLeads,
    processedLeads: job.processedLeads,
    failedLeads: job.failedLeads,
    skippedLeads: job.skippedLeads,
    sentBatches: job.sentBatches,
    totalBatches: job.totalBatches,
    batchSize: job.batchSize,
    delayMs: job.delayMs,
    dailyLimit: job.dailyLimit,
    dailyUsedBefore: job.dailyUsedBefore,
    dailyRemaining: job.dailyRemaining,
    currentBatchIndex: job.currentBatchIndex,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    progress: Math.min(progress, 100),
    errors: job.errors.slice(-10),
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ message: 'jobId es requerido' }, { status: 400 });
  }

  const cancelled = cancelJob(jobId);
  if (!cancelled) {
    return NextResponse.json({ message: 'Job no encontrado o no se puede cancelar' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Job cancelado exitosamente' });
}
