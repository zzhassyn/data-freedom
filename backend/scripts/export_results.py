"""Export the complete source set through the running server's evaluation queue.

Run from backend/: python scripts/export_results.py --group DEV --out ../results/dev/results.json
The server owns provider credentials and the only durable queue; this process
does not open the database, start STT, or resume unrelated evaluations.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.errors import ApiError
from app.export import validate_organizer_manifest, validate_organizer_results, write_organizer_results


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Повторяется JSON-поле {key}")
        result[key] = value
    return result


def _decode_json(response):
    if not response.is_success:
        try:
            error = response.json().get("error", {})
            message = error.get("message") if isinstance(error, dict) else None
        except (ValueError, AttributeError):
            message = None
        raise ValueError(message or f"Сервер вернул HTTP {response.status_code}")
    if response.headers.get("content-type", "").split(";", 1)[0].strip() != "application/json":
        raise ValueError("Сервер вернул результат не в формате JSON")
    # decode() deliberately rejects a BOM or invalid UTF-8; neither is emitted by
    # the API, and malformed input must not be silently rewritten into a result.
    text = response.content.decode("utf-8")
    return json.loads(text, object_pairs_hook=_strict_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Недопустимое число {value}")))


def export_from_server(client, group, output, *, evaluate_missing=True, timeout_seconds=600):
    manifest = _decode_json(client.get("/api/export/organizers/manifest", params={"groupId": group}))
    validate_organizer_manifest(manifest)
    if manifest["groupId"] != group:
        raise ValueError("Сервер вернул другой набор диалогов")
    response = client.post("/api/export/organizers", json={
        "groupId": group, "evaluateMissing": evaluate_missing,
        "sourceHash": manifest.get("sourceHash"), "timeoutSeconds": timeout_seconds,
    })
    document = _decode_json(response)
    validate_organizer_results(document, manifest)
    write_organizer_results(document, manifest, output)
    return document


def main(argv=None):
    parser = argparse.ArgumentParser(description="Выгрузить результаты в JSON 1.0 для организаторов")
    parser.add_argument("--group", required=True, help="DEV или group_id контрольного набора")
    parser.add_argument("--out", type=Path, required=True, help="Путь к results.json")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Адрес работающего сервера")
    parser.add_argument("--timeout", type=float, default=600, help="Ожидание недостающих оценок, секунд (до 1800)")
    parser.add_argument("--no-evaluate-missing", action="store_true", help="Не запускать модель; отсутствующие оценки записать как error")
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or not 0 < args.timeout <= 1800:
        parser.error("--timeout должен быть больше 0 и не больше 1800 секунд")
    try:
        with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=args.timeout + 30) as client:
            document = export_from_server(client, args.group, args.out,
                                          evaluate_missing=not args.no_evaluate_missing, timeout_seconds=args.timeout)
    except (ApiError, ValueError, UnicodeError, OSError, httpx.HTTPError) as exc:
        message = exc.message if isinstance(exc, ApiError) else str(exc)
        print(f"Выгрузка не записана: {message}", file=sys.stderr)
        return 1
    errors = sum(row["status"] == "error" for row in document["results"])
    print(f"Сохранено: {args.out.resolve()} ({len(document['results'])} диалогов, ошибок оценки: {errors})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
