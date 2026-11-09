"""Managed TEST API checks. Writes are restricted to a new fixture user/files."""
import base64
import hashlib
import json
import secrets
import ssl
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPSHandler


def run(r, executor):
    ref = executor.TEST_REF
    origin = "https://" + ref + ".supabase.co"
    keys = r.connection.keys
    context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    opener = build_opener(executor.ro.NoRedirect(), HTTPSHandler(context=context))
    allowed_hosts = {ref + ".supabase.co", ref + ".storage.supabase.co"}
    traces = []

    def http(method, path, body=None, token=None, extra=None, expect=None, label=None):
        url = path if path.startswith("https://") else origin + path
        parsed = urlsplit(url)
        executor.require(parsed.scheme == "https" and parsed.hostname in allowed_hosts and not parsed.username
                         and parsed.port in (None, 443) and parsed.path.startswith(("/auth/v1/", "/rest/v1/", "/storage/v1/")), "Test API URL mismatch.")
        if method == "GET" and parsed.path.startswith("/storage/v1/object/"):
            # Read actual object bytes, not a stale edge response after replacement.
            url += ("&" if parsed.query else "?") + "cacheNonce=" + secrets.token_hex(12)
        headers = {"apikey": keys["anon"], "Authorization": "Bearer " + (token or keys["service_role"])}
        if method == "GET":
            headers["Cache-Control"] = "no-cache"
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        headers.update(extra or {})
        try:
            with opener.open(Request(url, data=body, headers=headers, method=method), timeout=45) as response:
                status, data, returned_headers = response.status, response.read(), dict(response.headers)
        except HTTPError as error:
            status, data, returned_headers = error.code, error.read(), dict(error.headers)
        if label:
            traces.append({"label": label, "status": status})  # Never persist URL tokens/bodies/headers.
        if expect is not None:
            r.check(status in expect, (label or "test API request") + " HTTP status")
        return status, data, returned_headers

    pdf = b"%PDF-1.4\n% hosted cutover synthetic fixture " + r.run_id.encode() + b"\n%%EOF\n"
    path = "cutover-test-" + r.run_id + "/fixture.pdf"
    signed_path = "cutover-test-" + r.run_id + "/signed.pdf"
    tus_path = "cutover-test-" + r.run_id + "/resumable.pdf"
    r.fixture_paths = [path, signed_path, tus_path]
    bucket = "discussion-files"
    file_url = "/storage/v1/object/" + bucket + "/" + quote(path, safe="/")
    email = "cutover-" + r.run_id + "@example.invalid"
    password = secrets.token_urlsafe(30)
    _, data, _ = http("POST", "/auth/v1/admin/users", {"email": email, "password": password, "email_confirm": True,
                          "user_metadata": {"cutover_run": r.run_id}}, expect={200, 201}, label="new synthetic Auth fixture created")
    user = json.loads(data)
    r.fixture_user = user.get("id") or user["user"]["id"]
    executor.require(__import__("re").fullmatch(r"[a-f0-9-]{36}", r.fixture_user), "Unexpected fixture user ID.")
    user_id = r.fixture_user
    r.sql("INSERT INTO public.profiles(id,display_name) VALUES(" + executor.literal(user_id) + ",'임시 차단 검증');", "postgres")
    _, data, _ = http("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password},
                          expect={200}, label="fixture password login positive control")
    auth = json.loads(data)
    access, refresh = auth["access_token"], auth["refresh_token"]
    patch_path = "/rest/v1/profiles?id=eq." + user_id
    http("PATCH", patch_path, {"display_name": "차단 전"}, extra={"Prefer": "return=minimal"}, expect={204}, label="service REST write positive control")
    http("POST", file_url, pdf, extra={"Content-Type": "application/pdf", "x-upsert": "false"}, expect={200}, label="managed Storage upload positive control")
    _, data, _ = http("POST", "/storage/v1/object/upload/sign/" + bucket + "/" + signed_path, {}, expect={200}, label="signed upload URL prepared before freeze")
    sign_result = json.loads(data)
    signed_url = sign_result.get("url") or sign_result.get("signedURL")
    executor.require(isinstance(signed_url, str), "Signed test upload URL unavailable.")
    if signed_url.startswith("/object/"):
        signed_url = "/storage/v1" + signed_url
    elif not signed_url.startswith(("https://", "/storage/v1/")):
        raise RuntimeError("Unexpected test signed URL.")
    meta = ",".join(k + " " + base64.b64encode(v.encode()).decode() for k, v in
                    {"bucketName": bucket, "objectName": tus_path, "contentType": "application/pdf", "cacheControl": "3600"}.items())
    _, _, returned_headers = http("POST", "/storage/v1/upload/resumable", b"", extra={"Tus-Resumable": "1.0.0", "Upload-Length": str(len(pdf)), "Upload-Metadata": meta},
                                  expect={201}, label="TUS upload created before freeze")
    tus_url = next((v for k, v in returned_headers.items() if k.lower() == "location"), None)
    executor.require(tus_url is not None, "TUS fixture location unavailable.")
    original_objects = r.connection.snapshot()["storage.objects"]
    original_downloads = {}
    for obj in original_objects:
        url = "/storage/v1/object/" + quote(obj["bucket_id"], safe="") + "/" + quote(obj["name"], safe="/")
        _, data, _ = http("GET", url, expect={200}, label="original/fixture file read before freeze")
        original_downloads[obj["id"]] = {"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": data}
    frozen_before = r.connection.snapshot()
    r.save("preview-freeze-before.json", frozen_before)
    original_triggers = r.sql("SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname),'[]'::jsonb) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage','legacy_multiclub');", "postgres", read_only=True).stdout
    r.control("postgres")
    r.sql(executor.guarded_sql("install", "postgres", r.run_id), "postgres")
    r.api_barrier_active = True
    r.verify_guards("postgres")
    print("TEST API write barrier installed; checking writes and original file downloads.", flush=True)
    try:
        # Every attempted mutation below belongs to this new fixture, never an existing user/file.
        denied = {400, 403, 409, 500, 503}
        http("PATCH", patch_path, {"display_name": "拒否"}, extra={"Prefer": "return=minimal"}, expect={503}, label="service-role REST write refused")
        http("PATCH", patch_path, {"display_name": "拒否"}, token=access, extra={"Prefer": "return=minimal"}, expect={503}, label="authenticated REST write refused")
        http("GET", "/auth/v1/user", token=access, expect={200}, label="existing token user read retained")
        http("GET", patch_path + "&select=id", expect={200}, label="REST read retained")
        http("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password}, expect=denied, label="new fixture login refused")
        http("POST", "/auth/v1/token?grant_type=refresh_token", {"refresh_token": refresh}, expect=denied, label="fixture token refresh refused")
        http("PUT", "/auth/v1/user", {"data": {"cutover_attempt": r.run_id}}, token=access, expect=denied, label="fixture Auth metadata update refused")
        http("PUT", file_url, pdf + b"refused", extra={"Content-Type": "application/pdf"}, expect=denied, label="fixture file overwrite refused")
        http("DELETE", "/storage/v1/object/" + bucket, {"prefixes": [path]}, expect=denied, label="fixture file deletion refused")
        http("PUT", signed_url, pdf, extra={"Content-Type": "application/pdf"}, expect=denied, label="pre-issued signed upload refused")
        http("PATCH", tus_url, pdf, extra={"Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream"}, expect=denied, label="existing TUS completion refused")
        frozen_after = r.connection.snapshot()
        r.check(frozen_after == frozen_before, "every managed test row unchanged during rejected API writes")
        for item in original_downloads.values():
            _, data, _ = http("GET", item["url"], expect={200}, label="file download retained under barrier")
            r.check(hashlib.sha256(data).hexdigest() == item["sha256"], "managed original/fixture file bytes unchanged under barrier")
        frozen = r.connection.archive()
        r.save("preview-frozen.dump", frozen)
        r.save("preview-frozen-public.dump", r.connection.archive(public_only=True))
        r.save("frozen-files.json", [{"id": k, "sha256": v["sha256"]} for k, v in original_downloads.items()])
        for index, item in enumerate(original_downloads.values()):
            r.save("frozen-file-" + str(index) + ".bin", item["bytes"])
        r.offline_restore(frozen, frozen_before, "managed-frozen")
        r.sql("UPDATE cutover_test_control.run SET stage='readback_verified';", "postgres")
        r.sql(executor.guarded_sql("remove", "postgres", r.run_id), "postgres")
        r.api_barrier_active = False
        restored_triggers = r.sql("SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname),'[]'::jsonb) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage','legacy_multiclub');", "postgres", read_only=True).stdout
        r.check(original_triggers == restored_triggers, "all original managed triggers remain after barrier removal")
        http("PATCH", patch_path, {"display_name": "차단 해제 후"}, extra={"Prefer": "return=minimal"}, expect={204}, label="REST write resumes after removal")
        http("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password}, expect={200}, label="same fixture password login resumes")
        http("POST", "/auth/v1/token?grant_type=refresh_token", {"refresh_token": refresh}, expect={200}, label="same fixture refresh token resumes")
        http("PUT", file_url, pdf + b"resumed", extra={"Content-Type": "application/pdf"}, expect={200}, label="managed file replacement resumes")
        _, downloaded, _ = http("GET", file_url, expect={200}, label="replaced fixture downloaded")
        r.check(downloaded == pdf + b"resumed", "resumed replacement has expected bytes")
        http("PUT", signed_url, pdf, extra={"Content-Type": "application/pdf"}, expect={200}, label="same pre-issued signed URL resumes")
        # Rejected TUS requests may leave a temporary offset; read before resuming.
        _, _, tus_headers = http("HEAD", tus_url, extra={"Tus-Resumable": "1.0.0"}, expect={200, 204}, label="same TUS upload still available after barrier removal")
        offset = int(next(v for k, v in tus_headers.items() if k.lower() == "upload-offset"))
        r.check(offset in (0, len(pdf)), "TUS only contains the fixture bytes attempted during freeze")
        if offset < len(pdf):
            http("PATCH", tus_url, pdf[offset:], extra={"Tus-Resumable": "1.0.0", "Upload-Offset": str(offset), "Content-Type": "application/offset+octet-stream"}, expect={204}, label="same TUS upload resumes")
        else:
            # A retry at zero is needed when a failed finalize retained its staged bytes.
            http("PATCH", tus_url, b"", extra={"Tus-Resumable": "1.0.0", "Upload-Offset": str(offset), "Content-Type": "application/offset+octet-stream"}, expect={204}, label="same TUS staged upload finalizes after removal")
        _, downloaded, _ = http("GET", "/storage/v1/object/" + bucket + "/" + tus_path, expect={200}, label="resumed TUS file downloaded")
        r.check(downloaded == pdf, "resumed TUS bytes match synthetic PDF")
    finally:
        r.save("managed-api-statuses.json", traces)
        if r.api_barrier_active:
            # This only permits cleanup if every pre-freeze row and original file is intact.
            safe = r.connection.snapshot() == frozen_before
            for item in original_downloads.values():
                status, data, _ = http("GET", item["url"])
                safe = safe and status == 200 and hashlib.sha256(data).hexdigest() == item["sha256"]
            if safe:
                r.sql("UPDATE cutover_test_control.run SET stage='readback_verified';", "postgres")
                r.sql(executor.guarded_sql("remove", "postgres", r.run_id), "postgres")
                r.api_barrier_active = False
    # Cleanup touches only the newly created fixture's exact IDs/paths.
    http("DELETE", "/storage/v1/object/" + bucket, {"prefixes": r.fixture_paths}, expect={200}, label="only new fixture files removed")
    http("DELETE", "/auth/v1/admin/users/" + user_id, expect={200}, label="only new fixture Auth account removed")
    r.completed_fixture_user = user_id
    r.fixture_user = None
    r.sql(executor.assertion("postgres", r.run_id) + executor.stage_assertion(["resumed"]) + "DROP SCHEMA cutover_test_control CASCADE;", "postgres")
    r.save("managed-api-final-statuses.json", traces)
