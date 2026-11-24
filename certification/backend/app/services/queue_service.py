"""Async send queue with real-time progress broadcast via Server-Sent Events.

Architecture
------------
SendQueue is a module-level singleton that manages asyncio tasks for each
active bulk-send job.  Callers stream progress by consuming the async
generator ``progress_generator(job_id)``.

Data flow
---------
1. ``start_job()`` creates an asyncio.Task that processes rows sequentially.
2. Each row: generate PDF → send email → update DB → update in-memory state.
3. ``progress_generator()`` polls in-memory state every 0.5 s, yielding
   SSE-formatted JSON until the job is finished.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import email_service, pdf_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RowState:
    """Mutable state for one recipient row within a job."""

    row_index: int
    email: str
    name: str
    status: str = "pending"   # pending / sent / failed / skipped
    error: str = ""


@dataclass
class JobState:
    """Mutable state for one bulk-send job."""

    job_id: int
    total: int
    rows: list[RowState] = field(default_factory=list)
    sent: int = 0
    failed: int = 0
    current_row: int = 0
    status: str = "pending"   # pending / running / done / partial / error
    task: asyncio.Task | None = None  # type: ignore[type-arg]


# ---------------------------------------------------------------------------
# Singleton queue
# ---------------------------------------------------------------------------

class SendQueue:
    """Singleton that manages all in-flight send jobs."""

    def __init__(self) -> None:
        self._jobs: dict[int, JobState] = {}

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------

    async def start_job(
        self,
        job_id: int,
        rows: list[dict[str, Any]],
        type_config: dict[str, Any],
        credentials: dict[str, Any],
        db: AsyncSession,
        send_delay: float = 1.5,
    ) -> None:
        """Create and start an asyncio task to process *rows* sequentially.

        Parameters
        ----------
        job_id:
            DB primary key of the ``SendJob`` record.
        rows:
            List of row dicts — each must have ``_email``, ``_name``,
            ``_row_index``, and the full column data needed for PDF generation
            and email interpolation.
        type_config:
            AttestationType config dict (field_mappings, email_subject,
            email_body, filename_pattern, template_path, etc.).
        credentials:
            Decrypted email credentials dict (passed straight to
            :func:`email_service.send_email`).
        db:
            Async database session for updating SendLog records.
        send_delay:
            Seconds to wait between sends (rate limiting).
        """
        row_states = [
            RowState(
                row_index=r.get("_row_index", i),
                email=r.get("_email", ""),
                name=r.get("_name", ""),
            )
            for i, r in enumerate(rows)
        ]

        job_state = JobState(
            job_id=job_id,
            total=len(rows),
            rows=row_states,
            status="running",
        )
        self._jobs[job_id] = job_state

        task = asyncio.create_task(
            self._process_job(job_state, rows, type_config, credentials, db, send_delay)
        )
        job_state.task = task

    async def _process_job(
        self,
        job_state: JobState,
        rows: list[dict[str, Any]],
        type_config: dict[str, Any],
        credentials: dict[str, Any],
        db: AsyncSession,
        send_delay: float,
    ) -> None:
        """Internal coroutine that sends emails one by one."""
        import os, json as json_mod
        from app.models.attestation import SendJob, SendLog
        from sqlalchemy import select, update

        template_path: str = type_config.get("template_path", "")
        field_mappings: list[dict[str, Any]] = type_config.get("field_mappings", [])
        email_subject_tmpl: str = type_config.get("email_subject", "Your Certificate")
        email_body_tmpl: str = type_config.get("email_body", "Dear {{name}},\n\nPlease find attached.\n\nBest regards")
        filename_pattern: str = type_config.get("filename_pattern", "Certificate_{{name}}.pdf")
        generated_dir: str = type_config.get("generated_dir", "generated")
        sender_email: str = credentials.get("sender_email", "")

        for idx, row in enumerate(rows):
            row_state = job_state.rows[idx]
            job_state.current_row = row_state.row_index

            try:
                # --- Resolve output filename ---
                safe_name = row_state.name.replace("/", "_").replace("\\", "_") or f"row_{row_state.row_index}"
                row_for_interp = dict(row)
                row_for_interp["name"] = row_state.name
                filename = email_service.interpolate_template(filename_pattern, row_for_interp)
                # Sanitise
                filename = "".join(c for c in filename if c not in r'\/:*?"<>|').strip() or f"cert_{row_state.row_index}.pdf"
                if not filename.endswith(".pdf"):
                    filename += ".pdf"
                output_path = os.path.join(generated_dir, f"job{job_state.job_id}", filename)
                os.makedirs(os.path.dirname(output_path), exist_ok=True)

                # --- Generate PDF ---
                pdf_service.generate_pdf_for_row(
                    template_path=template_path,
                    field_mappings=field_mappings,
                    row_data=row,
                    output_path=output_path,
                )

                # --- Interpolate email ---
                subject = email_service.interpolate_template(email_subject_tmpl, row_for_interp)
                body = email_service.interpolate_template(email_body_tmpl, row_for_interp)

                # --- Send email ---
                success = await email_service.send_email(
                    config_dict=credentials,
                    to_email=row_state.email,
                    subject=subject,
                    body=body,
                    pdf_path=output_path,
                    sender_email=sender_email,
                )

                if success:
                    row_state.status = "sent"
                    job_state.sent += 1
                else:
                    row_state.status = "failed"
                    row_state.error = "Send returned False"
                    job_state.failed += 1

                # --- Update DB ---
                now = datetime.now(timezone.utc)
                await db.execute(
                    update(SendLog)
                    .where(
                        SendLog.job_id == job_state.job_id,
                        SendLog.row_index == row_state.row_index,
                    )
                    .values(
                        status=row_state.status,
                        error_message=row_state.error,
                        generated_pdf_path=output_path,
                        sent_at=now if row_state.status == "sent" else None,
                    )
                )
                await db.commit()

            except Exception as exc:
                logger.exception("Error processing row %s: %s", row_state.row_index, exc)
                row_state.status = "failed"
                row_state.error = str(exc)
                job_state.failed += 1
                try:
                    await db.execute(
                        update(SendLog)
                        .where(
                            SendLog.job_id == job_state.job_id,
                            SendLog.row_index == row_state.row_index,
                        )
                        .values(status="failed", error_message=str(exc))
                    )
                    await db.commit()
                except Exception:
                    pass

            if send_delay > 0:
                await asyncio.sleep(send_delay)

        # --- Finalise job status ---
        if job_state.failed == 0:
            job_state.status = "done"
        elif job_state.sent == 0:
            job_state.status = "error"
        else:
            job_state.status = "partial"

        # Update send_job record in DB
        try:
            await db.execute(
                update(SendJob)
                .where(SendJob.id == job_state.job_id)
                .values(
                    status=job_state.status,
                    sent_count=job_state.sent,
                    failed_count=job_state.failed,
                )
            )
            await db.commit()
        except Exception as exc:
            logger.error("Failed to update SendJob %s status: %s", job_state.job_id, exc)

    # ------------------------------------------------------------------
    # Progress
    # ------------------------------------------------------------------

    def get_progress(self, job_id: int) -> dict[str, Any] | None:
        """Return current in-memory progress snapshot for a job.

        Returns ``None`` if the job is not known to this queue.
        """
        state = self._jobs.get(job_id)
        if state is None:
            return None
        return {
            "job_id": state.job_id,
            "total": state.total,
            "sent": state.sent,
            "failed": state.failed,
            "current_row": state.current_row,
            "status": state.status,
        }

    async def progress_generator(
        self, job_id: int
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted progress events every 0.5 s until job ends.

        Yields
        ------
        str
            Lines in the format ``data: {...json...}\\n\\n``.
        """
        while True:
            progress = self.get_progress(job_id)
            if progress is None:
                yield f"data: {json.dumps({'job_id': job_id, 'status': 'unknown'})}\n\n"
                break

            yield f"data: {json.dumps(progress)}\n\n"

            if progress["status"] in ("done", "partial", "error"):
                break

            await asyncio.sleep(0.5)

    # ------------------------------------------------------------------
    # Retry
    # ------------------------------------------------------------------

    async def retry_failed(
        self,
        job_id: int,
        type_config: dict[str, Any],
        credentials: dict[str, Any],
        db: AsyncSession,
        send_delay: float = 1.5,
    ) -> None:
        """Re-process only the rows that previously failed.

        Parameters
        ----------
        job_id:
            Job to retry.
        type_config, credentials, db, send_delay:
            Same as :meth:`start_job`.
        """
        from app.models.attestation import SendLog
        from sqlalchemy import select

        # Load failed rows from DB
        result = await db.execute(
            select(SendLog).where(
                SendLog.job_id == job_id,
                SendLog.status == "failed",
            )
        )
        failed_logs = result.scalars().all()

        if not failed_logs:
            logger.info("No failed rows to retry for job %s", job_id)
            return

        import json as json_mod

        rows = []
        for log in failed_logs:
            try:
                row_data = json_mod.loads(log.row_data or "{}")
            except Exception:
                row_data = {}
            row_data["_row_index"] = log.row_index
            row_data["_email"] = log.recipient_email
            row_data["_name"] = log.recipient_name
            rows.append(row_data)

        # Reset state for failed rows
        state = self._jobs.get(job_id)
        if state:
            for rs in state.rows:
                if rs.status == "failed":
                    rs.status = "pending"
                    rs.error = ""
            state.status = "running"

        await self.start_job(
            job_id=job_id,
            rows=rows,
            type_config=type_config,
            credentials=credentials,
            db=db,
            send_delay=send_delay,
        )

    # ------------------------------------------------------------------
    # Cancel
    # ------------------------------------------------------------------

    def cancel_job(self, job_id: int) -> None:
        """Cancel an in-flight asyncio task for a job.

        Parameters
        ----------
        job_id:
            Job whose task should be cancelled.
        """
        state = self._jobs.get(job_id)
        if state and state.task and not state.task.done():
            state.task.cancel()
            state.status = "error"
            logger.info("Job %s cancelled", job_id)


# Module-level singleton
send_queue = SendQueue()
