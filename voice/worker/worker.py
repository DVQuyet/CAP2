import os
import platform
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv
import mysql.connector


REPO_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PYTHON = Path(
    os.getenv("VOICE_WORKER_PYTHON")
    or (REPO_ROOT / ".venv-whisper" / "Scripts" / "python.exe")
).resolve()

load_dotenv(REPO_ROOT / "Backend" / ".env")
load_dotenv(REPO_ROOT / ".env")

STORAGE_ROOT = Path(os.getenv("VOICE_STORAGE_ROOT") or (REPO_ROOT / "Backend" / "storage")).resolve()
POLL_SECONDS = float(os.getenv("VOICE_WORKER_POLL_SECONDS", "3"))
MODEL_NAME = os.getenv("VOICE_WHISPER_MODEL", "small")
DEVICE = os.getenv("VOICE_WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("VOICE_WHISPER_COMPUTE_TYPE", "int8")
LANGUAGE = os.getenv("VOICE_WHISPER_LANGUAGE", "vi").strip() or None
DELETE_WAV_ON_SUCCESS = os.getenv("VOICE_DELETE_WAV_ON_SUCCESS", "true").strip().lower() != "false"
DELETE_WAV_ON_FAILED = os.getenv("VOICE_DELETE_WAV_ON_FAILED", "false").strip().lower() == "true"


def validate_python_executable():
    current = Path(sys.executable).resolve()
    if current != EXPECTED_PYTHON:
        raise RuntimeError(
            "Voice worker phai chay bang .venv-whisper, khong dung AI-server\\.venv.\n"
            f"Expected: {EXPECTED_PYTHON}\n"
            f"Current : {current}\n"
            f"Run     : {EXPECTED_PYTHON} {REPO_ROOT / 'voice' / 'worker' / 'worker.py'}\n"
            f"Or      : powershell -ExecutionPolicy Bypass -File {REPO_ROOT / 'scripts' / 'run_voice_worker.ps1'}"
        )

    if "AI-server" in str(current) and ".venv" in str(current):
        raise RuntimeError(
            "Dang chay nham Python cua AI-server\\.venv. Hay dung D:\\cap2\\.venv-whisper\\Scripts\\python.exe."
        )


def load_whisper_model_class():
    if platform.architecture()[0] != "64bit":
        raise RuntimeError(
            "faster-whisper can cai Python 64-bit. Ban dang dung "
            f"{platform.architecture()[0]}: {sys.executable}"
        )

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            f"Thieu dependency Python: {exc}. Hay activate venv dung va chay: "
            f"{EXPECTED_PYTHON} -m pip install -r {REPO_ROOT / 'voice' / 'requirements.txt'}"
        ) from exc

    return WhisperModel


def db_config() -> dict:
    missing = [name for name in ("DB_HOST", "DB_USER", "DB_NAME") if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "Thieu cau hinh database cho voice worker: "
            + ", ".join(missing)
            + ". Kiem tra Backend\\.env hoac .env truoc khi connect."
        )
    return {
        "host": os.getenv("DB_HOST"),
        "port": int(os.getenv("DB_PORT") or 3306),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
        "connection_timeout": 10,
    }


def connect():
    return mysql.connector.connect(**db_config())


def split_sql_statements(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_single = False
    in_double = False
    escaped = False

    for char in sql:
        current.append(char)
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == "'" and not in_double:
            in_single = not in_single
            continue
        if char == '"' and not in_single:
            in_double = not in_double
            continue
        if char == ";" and not in_single and not in_double:
            statement = "".join(current).strip().rstrip(";").strip()
            if statement:
                statements.append(statement)
            current = []

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def ensure_schema():
    schema_sql = (REPO_ROOT / "voice" / "schema" / "voice.schema.sql").read_text(encoding="utf-8")
    conn = connect()
    cur = conn.cursor()
    try:
        for statement in split_sql_statements(schema_sql):
            cur.execute(statement)
        cur.execute("SHOW COLUMNS FROM recordings")
        existing_columns = {row[0] for row in cur.fetchall()}
        migrations = [
            (
                "processing_started_at",
                "ALTER TABLE recordings ADD COLUMN processing_started_at TIMESTAMP NULL AFTER status",
            ),
            (
                "transcript_edited",
                "ALTER TABLE recordings ADD COLUMN transcript_edited TINYINT(1) NOT NULL DEFAULT 0 AFTER transcript",
            ),
            (
                "transcript_edited_at",
                "ALTER TABLE recordings ADD COLUMN transcript_edited_at TIMESTAMP NULL AFTER transcript_edited",
            ),
            (
                "transcribed_at",
                "ALTER TABLE recordings ADD COLUMN transcribed_at TIMESTAMP NULL AFTER transcript_edited_at",
            ),
        ]
        for column_name, statement in migrations:
            if column_name not in existing_columns:
                cur.execute(statement)
        conn.commit()
    finally:
        cur.close()
        conn.close()


def claim_recording():
    conn = connect()
    cur = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cur.execute(
            """
            SELECT id, storage_path
            FROM recordings
            WHERE status = 'uploaded'
               OR (
                    status = 'transcribing'
                    AND processing_started_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                  )
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            FOR UPDATE
            """
        )
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None

        cur.execute(
            """
            UPDATE recordings
            SET status = 'transcribing',
                processing_started_at = CURRENT_TIMESTAMP,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (row["id"],),
        )
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def mark_completed(recording_id: int, transcript: str):
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE recordings
            SET status = 'completed',
                transcript = %s,
                transcribed_at = CURRENT_TIMESTAMP,
                processing_started_at = NULL,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (transcript, recording_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def mark_failed(recording_id: int, error_message: str):
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE recordings
            SET status = 'failed',
                error_message = %s,
                processing_started_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (error_message[:2000], recording_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def resolve_audio_path(storage_path: str) -> Path:
    raw_path = str(storage_path or "").strip().replace("/", os.sep)
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate.resolve()

    parts = candidate.parts
    if parts and parts[0].lower() == "storage":
        return (REPO_ROOT / "Backend" / candidate).resolve()
    if len(parts) >= 2 and parts[0].lower() == "backend" and parts[1].lower() == "storage":
        return (REPO_ROOT / candidate).resolve()
    return (STORAGE_ROOT / candidate).resolve()


def convert_to_wav(input_path: Path) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found in PATH. Cai ffmpeg va mo lai terminal truoc khi chay voice worker.")

    output_path = input_path.with_suffix(".wav")
    if output_path.resolve() == input_path.resolve():
        output_path = input_path.with_name(f"{input_path.stem}.whisper.wav")

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-ar",
        "16000",
        "-ac",
        "1",
        str(output_path),
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:2000]}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("ffmpeg converted file is empty.")

    return output_path


def normalize_transcript(text: str) -> str:
    text = " ".join(text.split())
    text = text.replace(" ,", ",")
    text = text.replace(" .", ".")
    text = text.replace(" ?", "?")
    text = text.replace(" !", "!")
    text = text.replace(" :", ":")
    return text.strip()


def transcribe(model, wav_path: Path) -> str:
    segments, info = model.transcribe(
        str(wav_path),
        language=LANGUAGE,
        task="transcribe",
        beam_size=5,
        best_of=5,
        temperature=0,
        vad_filter=False,
        condition_on_previous_text=False,
        no_speech_threshold=0.4,
        log_prob_threshold=-1.0,
        compression_ratio_threshold=2.4,
    )
    print(
        "Detected language/probability: "
        f"{getattr(info, 'language', None)}/{getattr(info, 'language_probability', None)}",
        flush=True,
    )

    texts: list[str] = []
    for segment in segments:
        segment_text = (segment.text or "").strip()
        print(f"Segment: {segment_text}", flush=True)
        if segment_text:
            texts.append(segment_text)

    transcript = normalize_transcript(" ".join(texts))
    print(f"Transcript length: {len(transcript)}", flush=True)
    return transcript


def main():
    validate_python_executable()
    print("Voice worker started", flush=True)
    print(f"Using Python executable: {sys.executable}", flush=True)
    print(
        f"Model name/device/compute type/language: "
        f"{MODEL_NAME}/{DEVICE}/{COMPUTE_TYPE}/{LANGUAGE or 'auto'}",
        flush=True,
    )
    ensure_schema()
    WhisperModel = load_whisper_model_class()
    model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)

    while True:
        job = claim_recording()
        if not job:
            time.sleep(POLL_SECONDS)
            continue

        recording_id = int(job["id"])
        audio_path = resolve_audio_path(str(job["storage_path"]))
        wav_path = None
        print(f"Found recording #{recording_id}", flush=True)
        print(f"Input path: {audio_path}", flush=True)

        try:
            if not audio_path.exists():
                raise FileNotFoundError(f"Audio file not found: {audio_path}")

            wav_path = convert_to_wav(audio_path)
            print(f"Converted wav path: {wav_path}", flush=True)

            transcript = transcribe(model, wav_path)
            if not transcript:
                raise RuntimeError(
                    "Whisper returned an empty transcript after wav conversion. "
                    "Kiem tra mic, file audio, ffmpeg output va nguong no_speech_threshold."
                )

            mark_completed(recording_id, transcript=transcript)
            print(f"Completed recording #{recording_id}", flush=True)
            if DELETE_WAV_ON_SUCCESS and wav_path and wav_path.exists():
                wav_path.unlink()
        except Exception as exc:
            traceback.print_exc()
            mark_failed(recording_id, str(exc))
            print(f"Failed recording #{recording_id} with reason: {exc}", flush=True)
            if DELETE_WAV_ON_FAILED and wav_path and wav_path.exists():
                wav_path.unlink()


if __name__ == "__main__":
    main()
