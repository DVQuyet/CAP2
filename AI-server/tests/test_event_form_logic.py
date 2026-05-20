import importlib.util
import json
import os
import pathlib
import sys
import unittest
from unittest.mock import patch


APP_DIR = pathlib.Path(__file__).resolve().parents[1]
APP_FILE = APP_DIR / "app.py"

os.environ["AI_DISABLE_GROQ"] = "true"


def load_ai_app():
    sys.path.insert(0, str(APP_DIR))
    spec = importlib.util.spec_from_file_location("ai_app_for_tests", APP_FILE)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError as exc:
        raise unittest.SkipTest(f"Missing AI-server dependency: {exc.name}") from exc
    return module


ai_app = load_ai_app()


def event_create_payload(**overrides):
    payload = {
        "mode": "event_create",
        "prompt": "Tao su kien gio to thang 8 tai nha tho ho, khoang 50 nguoi tham du",
        "today": "2026-05-17",
        "clan_id": 1,
        "requested_task_count": 6,
    }
    payload.update(overrides)
    return payload


def task_create_payload(**overrides):
    payload = {
        "mode": "task_create",
        "prompt": "Sinh them 5 cong viec khac cho su kien nay",
        "today": "2026-05-17",
        "current_event": {
            "id": 10,
            "title": "Gap mat cuoi nam",
            "event_date": "2026-12-31",
            "description": "Gap mat cuoi nam tai nha bac Quan",
            "clan_id": 1,
        },
        "existing_tasks": [
            {"title": "Thong bao lich gap mat cuoi nam"},
            {"title": "Chot danh sach con chau tham du"},
        ],
        "requested_task_count": 5,
    }
    payload.update(overrides)
    return payload


class DateParsingTests(unittest.TestCase):
    def test_month_positions(self):
        self.assertEqual(ai_app.parse_iso_date_from_text("thang 8", "2026-05-17"), "2026-08-01")
        self.assertEqual(ai_app.parse_iso_date_from_text("dau thang 8", "2026-05-17"), "2026-08-01")
        self.assertEqual(ai_app.parse_iso_date_from_text("giua thang 8", "2026-05-17"), "2026-08-15")
        self.assertEqual(ai_app.parse_iso_date_from_text("cuoi thang 8", "2026-05-17"), "2026-08-31")
        self.assertEqual(ai_app.parse_iso_date_from_text("cuoi nam", "2026-05-17"), "2026-12-31")

    def test_numeric_dates(self):
        self.assertEqual(ai_app.parse_iso_date_from_text("02/08/2026", "2026-05-17"), "2026-08-02")
        self.assertEqual(ai_app.parse_iso_date_from_text("02-08-2026", "2026-05-17"), "2026-08-02")
        self.assertEqual(ai_app.parse_iso_date_from_text("02.08.2026", "2026-05-17"), "2026-08-02")
        self.assertEqual(ai_app.parse_iso_date_from_text("2026-08-02", "2026-05-17"), "2026-08-02")
        self.assertEqual(ai_app.parse_iso_date_from_text("02/08", "2026-05-17"), "2026-08-02")


class EventFormFallbackTests(unittest.TestCase):
    def test_event_create_contract(self):
        result = ai_app.fallback_event_form(event_create_payload())

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["mode"], "event_create")
        self.assertEqual(result["event"]["event_date"], "2026-08-01")
        self.assertEqual(len(result["manager_tasks"]), 6)
        self.assertTrue(all(task["event_id"] is None for task in result["manager_tasks"]))
        self.assertTrue(all(task["status"] == "assigned" for task in result["manager_tasks"]))

    def test_task_create_contract_and_purpose_dedupe(self):
        result = ai_app.fallback_event_form(task_create_payload())

        titles = " ".join(task["title"] for task in result["manager_tasks"])
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["mode"], "task_create")
        self.assertEqual(len(result["manager_tasks"]), 5)
        self.assertTrue(all(task["event_id"] == 10 for task in result["manager_tasks"]))
        self.assertNotIn("Thong bao lich gap mat cuoi nam", ai_app.normalize_vietnamese(titles))
        self.assertNotIn("Chot danh sach con chau tham du", ai_app.normalize_vietnamese(titles))

    def test_unsupported_prompt(self):
        result = ai_app.fallback_event_form(
            event_create_payload(prompt="Hom nay gia vang the nao?", requested_task_count=None)
        )

        self.assertEqual(result["status"], "unsupported")
        self.assertEqual(result["manager_tasks"], [])


class NormalizationTests(unittest.TestCase):
    def test_invalid_task_create_without_event_id_is_unsupported(self):
        result = ai_app.normalize_event_form_result(
            {"status": "success", "mode": "task_create", "event": {}, "manager_tasks": [{"title": "A"}]},
            {"mode": "task_create", "prompt": "Sinh them viec", "current_event": {"id": None}},
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertEqual(result["manager_tasks"], [])

    def test_schema_is_normalized(self):
        result = ai_app.normalize_event_form_result(
            {
                "status": "success",
                "mode": "event_create",
                "event": {
                    "title": "  Gio to  ",
                    "event_date": "2026-08-01",
                    "description": "  Gio to tai nha tho ho  ",
                    "clan_id": 1,
                    "extra": "ignored",
                },
                "manager_tasks": [
                    {
                        "event_id": 99,
                        "member_id": 12,
                        "title": "  Chuan bi le vat  ",
                        "description": "  Chuan bi huong hoa  ",
                        "due_date": "2026-08-03",
                        "status": "done",
                        "extra": "ignored",
                    },
                    {"description": "missing title"},
                ],
            },
            event_create_payload(requested_task_count=None),
        )

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["event"], {
            "title": "Gio to",
            "event_date": "2026-08-01",
            "description": "Gio to tai nha tho ho",
            "clan_id": 1,
        })
        self.assertEqual(len(result["manager_tasks"]), 1)
        task = result["manager_tasks"][0]
        self.assertEqual(set(task.keys()), {"event_id", "member_id", "title", "description", "due_date", "status"})
        self.assertIsNone(task["event_id"])
        self.assertIsNone(task["member_id"])
        self.assertEqual(task["status"], "assigned")
        self.assertEqual(task["due_date"], "2026-08-01")

    def test_requested_task_count_is_enforced(self):
        result = ai_app.normalize_event_form_result(
            {
                "status": "success",
                "mode": "event_create",
                "event": {"title": "Gio to", "event_date": "2026-08-01", "description": "Gio to", "clan_id": 1},
                "manager_tasks": [{"title": "Chuan bi le vat"}],
            },
            event_create_payload(requested_task_count=4),
        )
        self.assertEqual(len(result["manager_tasks"]), 4)


class GenealogyExtractTests(unittest.TestCase):
    def test_genealogy_normalization_contract(self):
        result = ai_app.normalize_genealogy_extract_result(
            {
                "members": [
                    {
                        "temporary_id": "x1",
                        "full_name": "Nguyen Van A",
                        "gender": "male",
                        "birth_year": 1950,
                        "confidence": 1.2,
                        "extra": "ignored",
                    },
                    {
                        "temporary_id": "x2",
                        "full_name": "Tran Thi B",
                        "gender": "female",
                        "death_year": 1940,
                        "birth_year": 1955,
                        "confidence": "0.9",
                    },
                    {
                        "temporary_id": "x3",
                        "full_name": "Nguyen Van C",
                        "birth_year": 1960,
                        "confidence": 0.8,
                    },
                ],
                "relationships": [
                    {
                        "type": "spouse",
                        "from": "x1",
                        "to": "x2",
                        "confidence": 0.95,
                        "evidence": "A co vo la B",
                    },
                    {
                        "type": "parent_child",
                        "parent": "x1",
                        "child": "x3",
                        "confidence": 0.95,
                    },
                    {"type": "uncle", "from": "x1", "to": "x3"},
                ],
                "uncertain_items": [
                    {
                        "item_type": "member",
                        "reference_id": "x3",
                        "field": "birth_year",
                        "reason": "Nam sinh can kiem tra",
                    }
                ],
                "warnings": [{"warning_type": "source_warning", "message": "Can kiem tra", "related_ids": ["x1"]}],
                "summary": {"total_members_detected": 99, "total_relationships_detected": 99},
            },
            "text",
        )

        self.assertEqual(set(result.keys()), {"members", "relationships", "uncertain_items", "warnings", "summary"})
        self.assertEqual([member["temporary_id"] for member in result["members"]], ["p1", "p2", "p3"])
        self.assertEqual(result["members"][0]["confidence"], 1.0)
        self.assertEqual(len(result["relationships"]), 2)
        self.assertEqual(result["relationships"][0]["from"], "p1")
        self.assertEqual(result["relationships"][0]["to"], "p2")
        self.assertEqual(result["relationships"][1]["parent"], "p1")
        self.assertEqual(result["relationships"][1]["child"], "p3")
        self.assertEqual(result["uncertain_items"][0]["reference_id"], "p3")
        self.assertEqual(result["summary"], {
            "total_members_detected": 3,
            "total_relationships_detected": 2,
            "needs_human_review": True,
        })
        warning_types = {warning["warning_type"] for warning in result["warnings"]}
        self.assertIn("invalid_lifespan", warning_types)
        self.assertIn("age_gap_anomaly", warning_types)

    def test_voice_transcript_adds_review_warning(self):
        result = ai_app.normalize_genealogy_extract_result({"members": [], "relationships": []}, "voice_transcript")
        self.assertEqual(result["summary"]["needs_human_review"], True)
        self.assertIn("voice_transcript_review_required", {warning["warning_type"] for warning in result["warnings"]})


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = ai_app.app.test_client()

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            "success": True,
            "service": "ai-server",
            "groq_configured": False,
        })

    def test_event_create_endpoint_uses_fallback_when_groq_disabled(self):
        response = self.client.post("/event-form/generate", json=event_create_payload())
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["mode"], "event_create")
        self.assertEqual(data["event"]["event_date"], "2026-08-01")
        self.assertEqual(len(data["manager_tasks"]), 6)

    def test_task_create_endpoint(self):
        response = self.client.post("/event-form/generate", json=task_create_payload())
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["mode"], "task_create")
        self.assertEqual(len(data["manager_tasks"]), 5)
        self.assertEqual({task["event_id"] for task in data["manager_tasks"]}, {10})

    def test_unsupported_endpoint(self):
        response = self.client.post(
            "/event-form/generate",
            json=event_create_payload(prompt="Hom nay gia vang the nao?", requested_task_count=None),
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "unsupported")
        self.assertEqual(data["manager_tasks"], [])

    def test_empty_prompt_returns_400(self):
        response = self.client.post("/event-form/generate", json={"prompt": ""})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_genealogy_extract_endpoint_returns_schema_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={"input_source": "text", "prompt": "Noi dung khong co du lieu gia pha ro rang"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(data.keys()), {"members", "relationships", "uncertain_items", "warnings", "summary"})
        self.assertEqual(data["members"], [])
        self.assertEqual(data["relationships"], [])
        self.assertEqual(data["summary"]["needs_human_review"], True)
        self.assertIn("ai_model_unavailable", {warning["warning_type"] for warning in data["warnings"]})

    def test_genealogy_extract_rule_based_child_command_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={"input_source": "text", "prompt": "tạo con cho Nguyễn Minh Hưng Với tên là Nguyễn Minh Quốc"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([member["full_name"] for member in data["members"]], ["Nguyễn Minh Hưng", "Nguyễn Minh Quốc"])
        self.assertEqual(len(data["relationships"]), 1)
        self.assertEqual(data["relationships"][0]["type"], "parent_child")
        self.assertEqual(data["relationships"][0]["parent"], "p1")
        self.assertEqual(data["relationships"][0]["child"], "p2")
        self.assertEqual(data["summary"]["total_members_detected"], 2)
        self.assertEqual(data["summary"]["total_relationships_detected"], 1)

    def test_genealogy_extract_rule_based_spouse_command_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={"input_source": "text", "prompt": "thêm vợ cho Nguyễn Minh Hưng tên là Trần Thị Lan"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([member["full_name"] for member in data["members"]], ["Nguyễn Minh Hưng", "Trần Thị Lan"])
        self.assertEqual(data["members"][1]["gender"], "female")
        self.assertEqual(data["relationships"][0]["type"], "spouse")

    def test_genealogy_extract_rule_based_multiple_children_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={
                "input_source": "text",
                "prompt": "Thêm 2 người con cho Hà Văn Hòa, gồm Hà Văn Thái và Hà Văn Bảo.",
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([member["full_name"] for member in data["members"]], ["Hà Văn Hòa", "Hà Văn Thái", "Hà Văn Bảo"])
        self.assertEqual(
            [(relation["type"], relation["parent"], relation["child"]) for relation in data["relationships"]],
            [("parent_child", "p1", "p2"), ("parent_child", "p1", "p3")],
        )
        self.assertEqual(data["summary"]["total_members_detected"], 3)
        self.assertEqual(data["summary"]["total_relationships_detected"], 2)

    def test_genealogy_extract_rule_based_parent_has_three_children_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={
                "input_source": "text",
                "prompt": "Hà Văn Hòa có ba người con là Trần Thiên Ân, Trần Thiên Bình và Trần Thiên Cường.",
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [member["full_name"] for member in data["members"]],
            ["Hà Văn Hòa", "Trần Thiên Ân", "Trần Thiên Bình", "Trần Thiên Cường"],
        )
        self.assertEqual(len(data["relationships"]), 3)
        self.assertEqual({relation["child"] for relation in data["relationships"]}, {"p2", "p3", "p4"})

    def test_genealogy_extract_rule_based_multiple_actions_when_groq_disabled(self):
        response = self.client.post(
            "/genealogy/extract",
            json={
                "input_source": "text",
                "prompt": "Thêm con cho Hà Văn Hòa tên là Trần Thiên Ân. Thêm vợ cho Hà Văn Hòa tên là Trần Thiên Lý.",
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([member["full_name"] for member in data["members"]], ["Hà Văn Hòa", "Trần Thiên Ân", "Trần Thiên Lý"])
        self.assertEqual(data["relationships"][0]["type"], "parent_child")
        self.assertEqual(data["relationships"][0]["parent"], "p1")
        self.assertEqual(data["relationships"][0]["child"], "p2")
        self.assertEqual(data["relationships"][1]["type"], "spouse")
        self.assertEqual(data["relationships"][1]["from"], "p1")
        self.assertEqual(data["relationships"][1]["to"], "p3")

    def test_genealogy_extract_empty_prompt_returns_schema_400(self):
        response = self.client.post("/genealogy/extract", json={"prompt": ""})
        data = response.get_json()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(data.keys()), {"members", "relationships", "uncertain_items", "warnings", "summary"})
        self.assertIn("empty_prompt", {warning["warning_type"] for warning in data["warnings"]})

    def test_genealogy_extract_endpoint_with_groq_result(self):
        class FakeGroq:
            def __init__(self, *args, **kwargs):
                self.chat = self
                self.completions = self

            def create(self, *args, **kwargs):
                class Message:
                    content = json.dumps(
                        {
                            "members": [
                                {"temporary_id": "p1", "full_name": "Nguyen Van A", "gender": "male", "confidence": 0.95},
                                {"temporary_id": "p2", "full_name": "Tran Thi B", "gender": "female", "confidence": 0.95},
                            ],
                            "relationships": [
                                {
                                    "type": "spouse",
                                    "from": "p1",
                                    "to": "p2",
                                    "confidence": 0.95,
                                    "evidence": "A co vo la B",
                                }
                            ],
                            "uncertain_items": [],
                            "warnings": [],
                            "summary": {
                                "total_members_detected": 2,
                                "total_relationships_detected": 1,
                                "needs_human_review": True,
                            },
                        }
                    )

                class Choice:
                    message = Message()

                class Response:
                    choices = [Choice()]

                return Response()

        with patch.dict(os.environ, {"AI_DISABLE_GROQ": "false", "GROQ_API_KEY": "test-key"}):
            with patch.object(ai_app, "Groq", FakeGroq):
                app = ai_app.create_app()

        response = app.test_client().post(
            "/genealogy/extract",
            json={"input_source": "text", "prompt": "Ong Nguyen Van A co vo la ba Tran Thi B"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data["members"]), 2)
        self.assertEqual(len(data["relationships"]), 1)
        self.assertEqual(data["relationships"][0]["type"], "spouse")
        self.assertEqual(data["summary"]["total_members_detected"], 2)
        self.assertNotIn("success", data)

    def test_groq_error_falls_back(self):
        class BrokenGroq:
            def __init__(self, *args, **kwargs):
                self.chat = self
                self.completions = self

            def create(self, *args, **kwargs):
                raise RuntimeError("network unavailable")

        with patch.dict(os.environ, {"AI_DISABLE_GROQ": "false", "GROQ_API_KEY": "test-key"}):
            with patch.object(ai_app, "Groq", BrokenGroq):
                app = ai_app.create_app()

        response = app.test_client().post("/event-form/generate", json=event_create_payload())
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["event"]["event_date"], "2026-08-01")
        self.assertEqual(len(data["manager_tasks"]), 6)


if __name__ == "__main__":
    unittest.main()
