'use client';

import React, { useEffect, useState } from 'react';
import SubmissionResultCard, { SubmissionData } from './SubmissionResultCard';

export interface SubmissionPollerProps {
  submissionId: string;
  initialData?: SubmissionData;
  pollIntervalMs?: number;
  onFinished?: (finalData: SubmissionData) => void;
}

export default function SubmissionPoller({
  submissionId,
  initialData,
  pollIntervalMs = 2000,
  onFinished,
}: SubmissionPollerProps) {
  const [submission, setSubmission] = useState<SubmissionData | null>(
    initialData || { id: submissionId, status: 'PENDING' }
  );

  useEffect(() => {
    let mounted = true;
    let timerId: NodeJS.Timeout | null = null;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (!res.ok || !mounted) return;
        const data = await res.json();
        const sub = data.submission as SubmissionData;
        if (!mounted) return;

        setSubmission(sub);

        if (sub.status === 'COMPLETED' || sub.status === 'SYSTEM_ERROR') {
          if (timerId) {
            clearInterval(timerId);
            timerId = null;
          }
          onFinished?.(sub);
        }
      } catch {
        // Ignore network errors during polling
      }
    };

    // If initially in terminal state, no need to poll
    if (initialData?.status === 'COMPLETED' || initialData?.status === 'SYSTEM_ERROR') {
      return;
    }

    timerId = setInterval(checkStatus, pollIntervalMs);

    return () => {
      mounted = false;
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [submissionId, initialData, pollIntervalMs, onFinished]);

  const isPolling = submission?.status === 'PENDING' || submission?.status === 'RUNNING';

  return <SubmissionResultCard submission={submission} polling={isPolling} />;
}
